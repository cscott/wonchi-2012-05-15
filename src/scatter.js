#!/usr/bin/env node

var requirejs = require('requirejs');
requirejs(['commander', 'csv', 'fs', 'printf', './version'], function(program, csv, fs, printf, version) {

    var SUPPRESS_PAUSES = false;
    var USE_INDEXES = false;

    program
        .version(version)
        .usage('[options] <csvfile> ... <csvfile>')
        .option('-V, --version <balloons version>',
                'Specify the version of nell-balloons which generated this csv',
                1)
        .option('-x, --xdata <indexed|nopause|realtime>',
                'Specify what sort of data to emit on the x axis',
                'indexed')
        .option('-y, --ydata <correct|escape|incorrect|start|all>',
                'Specify what sort of data to emit on the y axis',
                'correct')
        .option('-t, --template <output filename template>',
                'Output template for data & gnuplot files',
                '%(num)s-%(xdata)s-%(ydata)s')
        .option('-g, --gnuplot',
                'Output gnuplot script for data')
        .option('-G, --gnuplot-all',
                'Output gnuplot script combining all ydata options')
        .parse(process.argv);

    if (program.args.length===0) {
        console.error("No input.");
        return;
    }

    var ydatalist = (program.ydata==='all') ? ['correct', 'escape', 'incorrect', 'start'] : [ program.ydata ];
    ydatalist.forEach(function(ydata) { program.args.forEach(function(csvfile, csvidx) {
        // look for a good number to use
        var csvm = csvfile.match(/\/csv_([0-9]+)\/[^\/]*\.csv$/);
        var csvnum = csvm ? csvm[1] : 'unk';

        // output filename
        var templateData =  {
            num: csvnum,
            full: csvfile,
            index: csvidx,
            xdata: program.xdata,
            ydata: ydata,
            version: program.version
        };
        var outfilename = printf(program.template, templateData);
        var dataOutput = fs.createWriteStream(outfilename+'.data',
                                              { encoding: 'utf-8' });

        var COLORS = ['yellow', 'black', 'lilac', 'orange', 'unknown'];
        var alive = {};
        COLORS.forEach(function(color) { alive[color] = []; });
        var pauseTime = 0;

        var wasPaused = 0, outIndex = 0;
        var outFirstTime=null;
        var doLog = function(which, timestamp, color, time, balloon) {
            var point = null;
            timestamp = +timestamp;
            if (outFirstTime===null) { outFirstTime = timestamp; }
            else if (wasPaused && program.xdata === 'nopause') {
                outFirstTime += wasPaused;
                wasPaused = 0;
            }
            var x = (program.xdata === 'indexed') ?
                outIndex : (timestamp - outFirstTime);
            if (which==='correct' && ydata === 'correct') {
                point = [x, time - (balloon.pauseTime||0)];
            }
            if (which==='incorrect' && ydata === 'incorrect') {
                point = [x, time];
            }
            if (which==='escape' && ydata === 'escape') {
                point = [x, time - (balloon.pauseTime||0)];
            }
            if (which==='start' && ydata === 'start') {
                point = [x, 20000];
            }
            outIndex++;
            if (point) {
                dataOutput.write(point[0]+'\t'+point[1]+'\n');
            }
        };

        csv().
            fromPath(csvfile, { columns: true }).
            on('data', function(data, index) {
                var m, color, time, b;
                // data has fields 'id', 'device', 'timestamp', 'name', 'value'
                switch (data.name) {
                case 'born':
                    alive[data.value].push({ born: data.timestamp });
                    break;
                case 'incorrect':
                    m = data.value.match(/^escape.([a-z]+):([0-9]+)/);
                    if (m) {
                        color = m[1]; time = m[2];
                        if (alive[color].length===0) {
                            // XXX workaround -- assume this was one of the
                            //     unknown balloons.
                            if (alive.unknown.length > 0) {
                                b = alive.unknown.shift();
                                doLog('escape', data.timestamp, color, time, b);
                            } else {
                                console.error("escape not born", color, index);
                            }
                        } else {
                            b = alive[color].shift();
                            doLog('escape', data.timestamp, color, time, b);
                        }
                        break;
                    } 
                    m = data.value.match(/^click.([a-z]+):([0-9]+)/);
                    if (m) {
                        color = m[1]; time = m[2];
                        if (alive[color].length > 0) {
                            console.error("incorrect but present",color,index);
                            // XXX another bug here?
                            //alive[color].length = 0;
                        } else {
                            doLog('incorrect', data.timestamp, color, time,
                                  null);
                        }
                        break;
                    }
                    console.error('unknown incorrect: '+data.value);
                    break;
                case 'correct':
                    m = data.value.match(/^([a-z]+):([0-9]+)/);
                    if (m) {
                        color=m[1]; time = m[2];
                        if (alive[color].length===0) {
                            // XXX workaround -- assume this was one of the
                            //     unknown balloons.
                            if (alive.unknown.length > 0) {
                                b = alive.unknown.shift();
                                doLog('correct', data.timestamp, color, time,b);
                            } else {
                                console.error("correct not born", color, index);
                            }
                        } else {
                            b = alive[color].shift();
                            doLog('correct', data.timestamp, color, time, b);
                        }
                        break;
                    }
                    console.error('unknown correct: '+data.value);
                    break;
                case 'status':
                    if (data.value === 'pause') {
                        pauseTime = +data.timestamp;
                    } else if (data.value === 'resume') {
                        if (pauseTime===0) {break;}
                        var paused = (+data.timestamp) - pauseTime;
                        //console.error('pause from', pauseTime, 'to', (+data.timestamp), '=', paused);
                        pauseTime = 0; // catch double resume
                        wasPaused += paused;
                        COLORS.forEach(function(color) {
                            alive[color].forEach(function(balloon) {
                                balloon.pauseTime = (balloon.pauseTime||0) +
                                    paused;
                            });
                        });
                    } else {
                        console.error('Unknown status: '+data.value);
                    }
                    break;
                case 'startColor':
                    COLORS.forEach(function(color){ alive[color].length = 0; });
                    // bug workaround
                    alive['unknown'].push({ born: data.timestamp });
                    alive['unknown'].push({ born: data.timestamp });
                    //console.error('startup', index);
                    doLog('start', data.timestamp, null, 0, null);
                    break;
                case 'colorchange':
                case 'highscore':
                    /* ignore */
                    break;
                default:
                    console.error('unknown name #'+index+': '+
                                  JSON.stringify(data));
                    break;
                }
            }).
            on('end', function(count) {
                var gp = [];
                if (program.gnuplot) { gp.push(false); }
                if (program.gnuplotAll) { gp.push(true); }
                gp.forEach(function(isAll) {
                    var gpOutput;
                    var gpfilename = outfilename;
                    if (isAll) {
                        var t = Object.create(templateData);
                        t.ydata = 'all';
                        gpfilename = printf(program.template, templateData);
                    };
                    gpOutput = fs.createWriteStream(gpfilename+'.gnuplot',
                                                    { encoding: 'utf-8' });
                    gpOutput.write(
                        'set terminal postscript landscape color\n'+
                        'set output "'+gpfilename+'.ps"\n'+
                        'set title "'+csvfile+'"\n');
                    var xlabel;
                    if (program.xdata === 'indexed') {
                        xlabel = "# of interactions";
                    } else if (program.xdata === 'nopause') {
                        xlabel = "Application use time (ms)";
                    } else if (program.xdata === 'realtime') {
                        xlabel = "Real time (ms)";
                    }
                    if (xlabel) {
                        gpOutput.write('set xlabel "'+xlabel+'"\n');
                    }
                    gpOutput.write('set ylabel "Time (ms)"\n');
                    gpOutput.write('set yrange [0:30000]\n');
                    if (!isAll) {
                        gpOutput.write('plot "'+outfilename+'.data"\n');
                    } else {
                        var files = ['correct', 'incorrect', 'escape', 'start'].
                            map(function(type) {
                                var t = Object.create(templateData);
                                t.ydata = type;
                                var f = printf(program.template, t);
                                return f;
                            }).map(function(f) {
                                return '"'+f+'.data"';
                            });
                        gpOutput.write('plot '+files[1]+', '+files[0]+', '+
                                       files[2]+', '+files[3]+' with impulses'+
                                       '\n');
                    }
                });
            }).
            on('error', function(error) {
                console.error(error.message);
            });
    }); });
});
