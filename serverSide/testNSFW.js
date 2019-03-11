const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

if(process.argv[2] === undefined) {
    console.log('Need a valid directory as parameter...'); return;
}

if(!fs.existsSync(process.argv[2])) {
    console.log('Need a valid directory as parameter...'); return;    
}

const directory_to_monitor = process.argv[2];
var es = require('event-stream'); //install first: npm i event-stream
var memwatch = require('memwatch-next');
var hd = new memwatch.HeapDiff();

var lineCount = 0
var rowCount = 0
var fileQueue = []

memwatch.on('leak', function(info) { 
    console.error("LEAK: " + info);
    var diff = hd.end();
    console.error("DIFF: " + diff);
    hd = new memwatch.HeapDiff();
});

// please quickly start this script after VM starts up
// ODB cannot cope with too many backlog files
console.log('Starting file monitoring....')

var watcher2;
startFileMonitor() 

// based on https://github.com/Axosoft/nsfw example
function startFileMonitor() {
    var nsfw = require('nsfw');
    
    return nsfw(
        directory_to_monitor,
        function(events) { // array of file action events
            for(var i = 0, len = events.length; i < len; i++){
                var elem = events[i]
                //console.log(elem)
            }
        },
        {
            debounceMS: 250,
            errorCallback(errors) {
                console.error(errors)
            }
        })
        .then(function(watcher) {
            watcher2 = watcher;
            console.log('watcher start')
            return watcher.start();
        })
}

