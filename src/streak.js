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

        var numConsecutiveIncorrect = 0;
        var maxConsecutiveIncorrect = 0;
        csv().
            fromPath(csvfile, { columns: true }).
            on('data', function(data, index) {
                var m;
                // data has fields 'id', 'device', 'timestamp', 'name', 'value'
                switch (data.name) {
                case 'incorrect':
                    m = data.value.match(/^escape.([a-z]+):([0-9]+)/);
                    if (m) {
                        break; /* ignore */
                    }
                    m = data.value.match(/^click.([a-z]+):([0-9]+)/);
                    console.assert(m);

                    numConsecutiveIncorrect++;
                    maxConsecutiveIncorrect = Math.max(maxConsecutiveIncorrect,
                                                       numConsecutiveIncorrect);

                    numConsecutiveCorrect = 0;
                    break;
                case 'correct':
                    numConsecutiveCorrect++;
                    maxConsecutiveCorrect = Math.max(maxConsecutiveCorrect,
                                                     numConsecutiveCorrect);

                    numConsecutiveIncorrect = 0;
                    break;
                }
                //console.log('#'+index+' '+JSON.stringify(data));
            }).
            on('end', function(count) {
                console.log("Stats for: "+csvfile);
                console.log("- Largest consecutive correct streak:   " +
                            maxConsecutiveCorrect);
                console.log("- Largest consecutive incorrect streak: " +
                            maxConsecutiveIncorrect);
            }).
            on('error', function(error) {
                console.error(error.message);
            });
    });
});
