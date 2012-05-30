#!/usr/bin/env node

/* Analyze data from the RunningApplicationsProbe */

var INCLUDE_CLASS_IN_APPNAME = false;

var requirejs = require('requirejs');
requirejs(['commander', 'csv', 'fs', 'printf', './version'], function(program, csv, fs, printf, version) {

    program
        .version(version)
        .usage('[options] <csvfile> ... <csvfile>')
        .option('-f, --format <csv format>',
                'Specify the input csv format', 'rap-v1')
        .option('-x, --xdata <timedelta|weekly|overall|daytime|weektime>',
                'Specify what sort of data to emit on the x axis',
                'timedelta')
        .option('-y, --ydata <percent|count>',
                'Specify what sort of data to emit on the y axis',
                'percent')
        .option('-T, --title <graph title>',
                'Specify title of graph', null)
        .option('-t, --template <output filename template>',
                'Output template for data & gnuplot files',
                '%(num)s-%(xdata)s-%(ydata)s')
        .option('-g, --gnuplot',
                'Output gnuplot script for data')
        .parse(process.argv);

    if (program.args.length===0) {
        console.error("No input.");
        return;
    }

    var rap_v1 = function(doLog) {
        var lastkey = null;
        return function (data, index) {
            var key = data.id + '|' + data.device + '|' + data.timestamp;
            if (key === lastkey) {
                // throw away all but the foreground activity
                return;
            }
            lastkey = key;
            if (data.RUNNING_TASKS_baseActivity_mPackage ===
                'edu.mit.media.prg.launcher') {
                return; // ignore launcher wrappers
            }
            var appname = data.RUNNING_TASKS_baseActivity_mPackage;
            // apps have multiple components, distinguished with the
            // RUNNING_TASKS_topActivity_mClass field.
            // these don't appear to be significant; neither do the different
            // baseActivity_mClass corresponding to a single mPackage.
            if (INCLUDE_CLASS_IN_APPNAME) {
                appname += ' ' + data.RUNNING_TASKS_baseActivity_mClass;
            }
            // normalize phonics app names
            if (data.RUNNING_TASKS_baseActivity_mPackage.match
                (/^BMA_CO.Phonics_Lv\d+_Unit\d+$/)) {
                appname = appname.replace(/\d+/g, '');
            }
            doLog(data.timestamp, appname);
        };
    };
    var la_v1 = function(doLog) {
        return function(data, index) {
            doLog(data.timestamp, data.value);
        };
    };

    INPUT_FORMATS = {
        'rap-v1': rap_v1, /* RunningApplicationsProbe, version 1 */
        'la-v1': la_v1  /* LauncherApp, version 1 */
    };
    if (!INPUT_FORMATS.hasOwnProperty(program.format)) {
        console.error('Unknown format.');
        return;
    }

    var Histogram = function() {
        this.bins = {};
    };
    Histogram.prototype.add = function(x, y) {
        if (!y && y!==0) { y = 1; }
        x = this.binX(x);
        var key = '$' + x;
        var prev = this.bins[key] || 0;
        this.bins[key] = prev + y;
    };
    Histogram.prototype.binX = function(x) {
        return x;
    };
    Histogram.prototype.sortX = function(a, b) {
        if (a < b) { return -1; }
        if (a > b) { return +1; }
        return 0;
    };
    Histogram.prototype.process = function(timestamp, appname) {
        this.add(appname);
    };
    Histogram.prototype.sortedBins = function() {
        var bins = [], b;
        Object.keys(this.bins).forEach(function(b) {
            console.assert(b[0] === '$');
            bins.push(b.substr(1));
        });
        bins.sort(this.sortX.bind(this));
        return bins;
    };
    Histogram.prototype.emitData = function(stream) {
        stream.write(program.xdata+'\t'+program.ydata+'\n');
        this.sortedBins().forEach(function(bin) {
            stream.write(bin+'\t'+(this.bins['$'+bin]||0)+'\n');
        }.bind(this));
    };
    Histogram.prototype.emitGnuplot = function(stream, title, dataFilename,
                                              psFilename) {
        stream.write('set terminal postscript landscape color\n'+
                     'set output "'+psFilename+'"\n'+
                     'set title "'+title+'"\n'+
                     'set style data histogram\n'+
                     'set style histogram cluster gap 0\n'+
                     'set xtics rotate by -90 scale 0 font ",7" offset character 1,0\n');
        if (this.xlabel) {
            stream.write('set xlabel "'+this.xlabel+'"\n');
        }
        if (this.ylabel) {
            stream.write('set ylabel "'+this.ylabel+'"\n');
        }
        stream.write('plot "'+dataFilename+'" using 2:xtic(1) title columnheader\n');
    };

    // timestamp difference histogram
    var mkTimeDeltaHistogram = function(lowerLimit, upperLimit) {
        lowerLimit = lowerLimit || 0; /* seconds */
        upperLimit = upperLimit || 300; /* seconds */
        var THisto = new Histogram();
        // 5s bins
        THisto.binX = function(x) {
            if (x < lowerLimit) { return "<"; }
            if (x > upperLimit) { return ">"; }
            return 5*Math.round(x/5);
        };
        // numeric comparison, with extrema
        THisto.sortX = function(a, b) {
            if (a==='<' || b==='>') return -1;
            if (a==='>' || b==='<') return +1;
            if (a===b) return 0;
            return (+a) - (+b);
        };
        // don't omit points
        THisto.sortedBins = (function(superSortedBins, incr) {
            return function() {
                var bins = superSortedBins.call(this);
                var nbins = [], hasLowerLimit = false, hasUpperLimit = false;
                if (bins[0]==='<') {
                    hasLowerLimit = true;
                    nbins.push(bins.shift());
                }
                if (bins.length && bins[bins.length-1]==='>'){
                    hasUpperLimit = true;
                    bins.pop();
                }
                if (bins.length>1) {
                    var lower = +bins[0];
                    var upper = +bins[bins.length-1];
                    for ( ; lower <= upper ; lower += incr) {
                        nbins.push(lower);
                    }
                } else if (bins.length) {
                    nbins.push(bins[0]);
                }
                if (hasUpperLimit) {
                    nbins.push('>');
                }
                return nbins;
            };
        })(THisto.sortedBins, 5);

        THisto.xlabel = "Seconds between samples";

        var lastTime = null;
        THisto.process = function(timestamp, appname) {
            timestamp = +timestamp;
            if (lastTime === null) { lastTime = timestamp; return; }
            this.add((timestamp - lastTime) /*delta in seconds*/ );
            lastTime = timestamp;
        };
        return THisto;
    };

    var histo;
    if (program.xdata === 'timedelta') {
        histo = mkTimeDeltaHistogram(0, 300);
        program.ydata = 'count';
    }

    var filesToGo = program.args.length;
    program.args.forEach(function(csvfile, csvidx) {
        // look for a good number to use
        var csvm = csvfile.match(/\/csv_([0-9]+)\/[^\/]*\.csv$/);
        var csvnum = csvm ? csvm[1] : 'unk';

        // output filename
        var templateData =  {
            num: csvnum,
            full: csvfile,
            index: csvidx,
            xdata: program.xdata,
            ydata: program.ydata,
            version: program.version
        };
        var outfilename = printf(program.template, templateData);
        var gpfilename = outfilename;

        csv().
            fromPath(csvfile, { columns: true }).
            on('data',
               INPUT_FORMATS[program.format](histo.process.bind(histo))).
            on('end', function(count) {
                // XXX this file is done, only call emit when group is done
                if ((--filesToGo) > 0) { return; }
        var dataOutput = fs.createWriteStream(outfilename+'.data',
                                              { encoding: 'utf-8' });
        var gpOutput = fs.createWriteStream(gpfilename+'.gnuplot',
                                                { encoding: 'utf-8' });
                histo.emitData(dataOutput);
                histo.emitGnuplot(gpOutput, program.title || csvfile,
                                  outfilename+'.data', outfilename+'.ps');
            }).
            on('error', function(error) {
                console.error(error.message);
            });
    });
});
