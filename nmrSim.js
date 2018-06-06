///NMR SIM v1.0

var log = console.log;
var _ = require('lodash');
var inspect = require('util').inspect;
var prompt = require('prompt');
var fs = require('fs');

var config = JSON.parse(fs.readFileSync('./nmrSim.cfg.txt'));

var machines = {
    '300WB': {
        topshim: false,
        supportedExperiments: [],
    },
    '300NB': {
        topshim: true,
        supportedExperiments: []
    },
    '400': {
        topshim: true,
        supportedExperiments: []
    },
    '400SL': {
        topshim: true,
        supportedExperiments: []
    },
    '500SL': {
        topshim: true,
        supportedExperiments: []
    }
};

function forceQuit() {
    log('\tterminating application...');
    process.exit();
}

function confirm(command, ask, require, key, cb) {
    log(ask);
    prompt.get("(Y/N)", (err, res) => {
        switch (res["(Y/N)"]) {
            case "Y":
            case "y":
            case "yes":
            case "YES":
                confirmations[key] = true;
                if (cb) cb();
                else progress(command);
                break;
            default:
                log(require);
                confirm(command, ask, require, key, cb);
        }
    });
}

var confirmations = {
    'cleaned sample': (JSON.parse(config['use confirmations'])) ? false : true,
    'selected directory': (JSON.parse(config['use confirmations'])) ? false : true,
    'lock': false,
    'new': false,
    'details': (JSON.parse(config['use confirmations'])) ? false : true,
    'rsh today': false,
    'atma': false,
    'rpar': false,
    'shim': false,
    'bsmsdisp': (JSON.parse(config['use confirmations'])) ? false : true
};

var hints = {
    'New/Lock': {
        'lock': () => (confirmations['lock']) ? false : "hint: you must lock in your solvent signal",
        'new': () => (confirmations['new']) ? false : 'hint: you are ready to create a new file',
        'rsh today': () => (confirmations['rsh today']) ? false : 'hint: you should reset the shims to today\'s standard best values',
    },
    'rpar/shim': {
        'shim': () => (confirmations['shim']) ? false : "hint: you must shim your sample",
        'rpar': () => (confirmations['rpar']) ? false : "hint: you must load the parameters for your experiment",
    },
    ej: 'hint: the blank must be ejected and removed from the machine...',
    ij: 'hint: you are ready to inject your sample into the NMR machine',
    atma: 'hint: you are ready to tune your probe',
    start: 'hint: you are ready to start the NMR experiment',
    zg: 'hint: you are ready to start the heteronucleus NMR experiment (use "zg", not "start")',
    tr: 'hint: you are ready to transfer your data',
    efp: 'hint: you are ready to efp'
};

var solvents = [
    'c6d6',
    'cdcl3',
    'd2o'
];

log('\n----- NMR Sim 1.0 ----- \n');
log(`Supported solvents: ${inspect(solvents)}\n`);
_.each(solvents, (solvent, i) => {
    solvents[i] = `lock ${solvent}`;
});

var parameterFile = ['protonstd', 'carbon.top', 'fluorine.top', 'phosphorus.top'];
log(`Supported Parameters: ${inspect(parameterFile)}\n`);
_.each(parameterFile, (file, i) => {
    parameterFile[i] = `rpar ${file}`;
});

function progress(command) {
    switch (command) {
        case 'init':
            getNextCommand('ej', "command", hints.ej)
            break;
        case 'ej':
            if (!confirmations['cleaned sample']) confirm(command,
                'Did you clean your sample with ethanol and use the sizer to ensure proper fit?',
                'You must clean your sample so that no particles get lodged in the machine, as these can interfere with everyone\'s experiments. \nYou must use the sizer to ensure proper fit',
                'cleaned sample');
            else getNextCommand('ij', "command", hints.ij);
            break;
        case 'ij':
            unorderedCommand(['new', 'lock', 'rsh today'], 'New/Lock', hints['New/Lock'], 'command', {
                'lock': solvents
            }, (input, commandArray) => {
                if (input == 'new') if (!confirmations['details']) {

                    confirm(undefined,
                        'Did you type in\n  -Title \n  -Experiment # \n  -Procedure # \n  -etc?',
                        'You must type in the descriptive information for this experiment',
                        'details', () => {
                            confirmations['new'] = true;
                            var commandsRemaining = _.without(commandArray, 'new');
                            if (commandsRemaining.length == 0) { progress('New/Lock') }
                            else unorderedCommand(commandsRemaining, 'New/Lock', hints['New/Lock'], 'command', {
                                'lock': solvents
                            });
                        });

                    return true; //interrupts usual code to only run above code instead
                }
            });
            break;
        case 'New/Lock':
            unorderedCommand(['rpar', 'shim'], 'rpar/shim', hints['rpar/shim'], 'command', {
                'rpar': parameterFile,
                'shim': ((config.machine == "300WB") || (config.machine == "300wb")) ? ['bsmsdisp'] : ['bsmsdisp', 'topshim']
            },
                (input, commandArray) => {
                    if (input.lastIndexOf('rpar') != -1) {
                        if (input.lastIndexOf('protonstd') != -1) {
                            confirmations.needATMA = false;
                        } else {
                            confirmations.needATMA = true;
                        }
                    }
                    if (input == 'bsmsdisp') if (!(confirmations['bsmsdisp'])) {
                        confirm(undefined,
                            'Did you manually shim Z, then Z^2, and alternate between the two until the lock signal was maximized (finishing with Z)?',
                            'You must manually shim Z, then Z^2, and alternate between the two until lock signal is maximized (finishing with Z)',
                            'bsmsdisp', () => {
                                confirmations['shim'] = true;
                                var commandsRemaining = _.without(commandArray, 'shim');
                                if (commandsRemaining.length == 0) { progress('rpar/shim'); }
                                else unorderedCommand(commandsRemaining, 'rpar/shim', hints['rpar/shim'], 'command', {
                                    'rpar': parameterFile,
                                    'shim': (String(config.machine).toUpperCase() == "300WB") ? ['bsmsdisp'] : ['bsmsdisp', 'topshim']
                                }, input => {
                                    if (input.lastIndexOf('rpar') != -1) {
                                        if (input.lastIndexOf('protonstd') != -1) {
                                            confirmations.needATMA = false;
                                        } else {
                                            confirmations.needATMA = true;
                                        }
                                    }
                                });
                            });

                        return true;
                    }
                });
            break;
        case 'rpar/shim':
            if (confirmations.needATMA) getNextCommand('atma', 'command', hints.atma);
            else getNextCommand('start', 'command', hints.start);
            break;

        case 'atma':
            getNextCommand('zg', 'command', hints.zg);
            break;

        case 'start':
        case 'zg':
            log('scanning...', '(please wait)');
            setTimeout(() => {
                log('scans complete');
                setTimeout(() => { getNextCommand('tr', 'command', hints.tr); }, 500);
            }, 500);
            break;

        case 'tr':
            //log('you have now transferred the data from the scans');
            getNextCommand('efp', 'command', hints.efp);
            break;
        case 'efp':
            log('Congratulations, your NMR data is now displayed on screen!')
            log('\nDon\'t forget to open the terminal (under applications),\ntype "update", \nhit enter, \ntype your password (it will be invisible, just type anyways),\nand hit enter again to save your data to the NMR server!\n\n\t----- simulation complete -----');
            
            log('\nHit Enter to terminate application');
            prompt.get('(press Enter)',(err,res)=>{
                forceQuit();
            });
            break;
        default:
            log('\n \t critical error: progress(undefined)')
    }

}
var getNextCommand = function (nextCommand, type, hint) {
    log('\nReady for command');
    prompt.get(type, (err, res) => {
        if (res[type] == 'exit') forceQuit();

        if (res[type] == nextCommand) {
            log(nextCommand, 'done \n');
            progress(nextCommand);
        }
        else {
            log('command INCORRECT \n');
            if (hint) log(hint);
            getNextCommand(nextCommand, type, hint);
        }
    });
}

var optionGetNextCommand = function (command, nextCommand, hint, type) {
    log('\nReady for command');
    prompt.get(type, (err, res) => {
        if (res[type] == 'exit') forceQuit();

        if (res[type].lastIndexOf(command) != -1) {
            log(res[type], 'done \n');
            progress(nextCommand);
        }
        else {
            log('command INCORRECT \n');
            if (hint) log(hint);
            optionGetNextCommand(command, nextCommand, hint, type);
        }
    });
};

var unorderedCommand = function (commandArray, nextCommand, hintOBJ, type, options, immediate) {
    log('\nReady for command');
    prompt.get(type, (err, res) => {
        if (res[type] == 'exit') forceQuit();

        if (immediate) if (immediate(res[type], commandArray)) { return true; }

        var validCommand;
        _.each(commandArray, (com) => {

            if (options[com]) {

                _.each(options[com], (option, i) => {
                    if (res[type] == option) {
                        validCommand = com;
                        return false;
                    }
                });
            } else if (res[type] == com) {
                validCommand = com;
                return false;
            }
        });
        if (validCommand) {
            log(res[type], 'done \n');
            var commandsRemaining = _.without(commandArray, validCommand);
            confirmations[validCommand] = true;
            if (commandsRemaining.length == 0) {
                progress(nextCommand);
            }
            else {
                unorderedCommand(commandsRemaining, nextCommand, hintOBJ, type, options, immediate);
            }
        }
        else {
            log('command INCORRECT \n');
            if (hintOBJ) _.each(hintOBJ, hint => { if (hint()) log(hint()) });
            unorderedCommand(commandArray, nextCommand, hintOBJ, type, options, immediate);
        }
    });

};

prompt.start();

log(`You are using the "Bruker ${String(config.machine).toUpperCase()}"\n`);

log('A blank sample is currently in the machine \n');

progress('init');



