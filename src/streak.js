#!/usr/bin/env node

var requirejs = require('requirejs');
requirejs(['commander', 'csv'], function(program, csv) {

    program
        //.version(version)
        .usage('[options] <csvfile> ... <csvfile>')
        .parse(process.argv);

    if (program.args.length===0) {
        console.error("No input.");
        return;
    }

    program.args.forEach(function(csvfile) {
        var numConsecutiveCorrect = 0;
        var maxConsecutiveCorrect = 0;
        csv().
            fromPath(csvfile, { columns: true }).
            on('data', function(data, index) {
                // data has fields 'id', 'device', 'timestamp', 'name', 'value'
                switch (data.name) {
                case 'incorrect':
                    numConsecutiveCorrect = 0;
                    break;
                case 'correct':
                    numConsecutiveCorrect++;
                    maxConsecutiveCorrect = Math.max(maxConsecutiveCorrect,
                                                     numConsecutiveCorrect);
                    break;
                }
                //console.log('#'+index+' '+JSON.stringify(data));
            }).
            on('end', function(count) {
                console.log("Stats for: "+csvfile);
                console.log("- Largest consecutive correct streak: " +
                            maxConsecutiveCorrect);
            }).
            on('error', function(error) {
                console.error(error.message);
            });
    });
});
