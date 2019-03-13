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
var lineCount = 0
var rowCount = 0
var fileQueue = []

// please quickly start this script after VM starts up
// ODB cannot cope with too many backlog files
console.log('Starting file monitoring....')

async function startDB(){
    await connectODB();
    console.log('client & session opened')
    fs.readdir(directory_to_monitor, function(err, items) {
        console.log(items); 
        for (var i=0; i<items.length; i++) {
            if(items[i].indexOf('rotated')>= 0 && items[i].indexOf('.txt')>= 0) {
                console.log('adding ' + items[i]);
                fileQueue.push(directory_to_monitor + '/' + items[i])
                var logdir = directory_to_monitor + '/' + items[i];
                if(fs.existsSync(logdir.replace('.txt','')) == true) { 
                    fs.rmdirSync(logdir.replace('.txt','')); 
                }
            }
        }
        processFile(fileQueue.shift())
    });
}

startDB();
startFileMonitor()

/**
 * Need to start with expose gc, eg:
 * pm2 restart 14 --node-args="--expose_gc"
 *  */ 
setInterval(() => { global.gc() }, 3000);
//processFile('/tmp/events.txt') // test single file

//https://stackoverflow.com/questions/16010915/parsing-huge-logfiles-in-node-js-read-in-line-by-line
function processFile(filepath) {
    if(fs.existsSync(filepath) == false) return
    
    console.log('Processing ' + filepath)
    var s = fs.createReadStream(filepath)
        .pipe(es.split())
        .pipe(es.mapSync(async function(line) {            
            s.pause();
            // process line here and call s.resume() when rdy
            processLine(line)
            // resume the readstream, possibly from a callback
            s.resume();
        })
        .on('error', function(err){
            console.error('Error while reading file.', err);
        })
        .on('end', function(){
            console.log('Files in queue: ' + fileQueue.length)
            console.log('Total line count: ' + lineCount) // tally with row count
            console.log('Total row count:' + rowCount)
            console.log('Delta: ' + (lineCount - rowCount))     
            setTimeout(function(){ // delayed delete to mitigate any file contention
                deleteFile(filepath)
            },200)
            if(fileQueue.length > 0){
                processFile(fileQueue.shift())
            }
        })
    );    
}

function deleteFile(filepath) {
    fs.unlink(filepath, (err) => {
        if (err) {
          console.error('retry deleting ' + filepath);
          deleteFile(filepath)
        }
        else {
          console.log(filepath + ' was deleted');
        }    
      });
}

//push most of the logic into server side function
function processLine(eventline) {
    return new Promise( async(resolve, reject) => { 
        try {
            if(eventline.length > 0) {
                //var e = JSON.parse(eventline.trim()) //to test if it is valid JSON            
                stmt = "select AddEvent(:data)"
                lineCount++
                await _session.query(stmt,{params:{data:escape(eventline)}}).all().catch(function(err) {
                    reject(err)
                });
                resolve(++rowCount)
            }
        }
        catch(err) {
            console.error('line length: ' + eventline.length)
            console.error('invalid JSON line:')
            console.error(eventline)
            console.error(err)
            reject(err)
        }
    })
}

// based on https://github.com/Axosoft/nsfw example
function startFileMonitor() {
    var nsfw = require('nsfw');
    var watcher2;
    return nsfw(
        directory_to_monitor,
        function(events) { // array of file action events
            for(i = 0, len = events.length; i < len; i++){
                if(events[i]['action'] == 0) { // only interested with file renamed
                    // a dir is created after file completes upload
                    var newfile = "" + events[i]['directory'] + "/" + events[i]['file']                            
                    if(newfile.indexOf('.txt') > 0) continue;
                    if(newfile.indexOf('rotated') > -1){ // expecting 'rotated' in the nxlog log file
                        fs.rmdirSync(newfile);
                        fileQueue.push(newfile + '.txt');
                        processFile(fileQueue.shift());
                        if(fileQueue.length > 0) setTimeout(function(){ processFile(fileQueue.shift()); }, 500)
                    }
                }
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
            return watcher.start();
        })
}



