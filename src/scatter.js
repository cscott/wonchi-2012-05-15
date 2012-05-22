#!/usr/bin/env node

var requirejs = require('requirejs');
requirejs(['commander', 'csv'], function(program, csv) {

    var SUPPRESS_PAUSES = false;
    var USE_INDEXES = false;

    program
        //.version(version)
        .usage('[options] <csvfile> ... <csvfile>')
        .parse(process.argv);

    if (program.args.length===0) {
        console.error("No input.");
        return;
    }

    program.args.forEach(function(csvfile) {
        var COLORS = ['yellow', 'black', 'lilac', 'orange', 'unknown'];
        var alive = {};
        COLORS.forEach(function(color) { alive[color] = []; });
        var pauseTime = 0;

        var wasPaused = 0, outIndex = 0;
        var outCorrect = [], outFirstTime=null;
        var doLog = function(which, timestamp, color, time, balloon) {
            timestamp = +timestamp;
            if (outFirstTime===null) { outFirstTime = timestamp; }
            else if (wasPaused && SUPPRESS_PAUSES) {
                outFirstTime += wasPaused;
                wasPaused = 0;
            }
            if (which==='correct') {
                outCorrect.push([USE_INDEXES ? (outIndex++) :
                                 (timestamp - outFirstTime),
                                 time - (balloon.pauseTime||0)]);
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
                outCorrect.forEach(function(x) {
                    console.log(x[0], x[1]);
                });
            }).
            on('error', function(error) {
                console.error(error.message);
            });
    });
});
