var ODB_User = 'root'
var ODB_pass = 'Password1234'
var OrientDB = require('orientjs');
var server = OrientDB({host: 'localhost', port: 2424});
var db = server.use({name: 'DataFusion', username: ODB_User, password: ODB_pass, useToken : false});

process.stdin.resume();//so the program will not close instantly
function exitHandler(err) {
    console.log('cleaning up...')
    db.close().then(function(){
        process.exit();
    })
}
process.on('exit', exitHandler.bind(null));
process.on('SIGINT', exitHandler.bind(null));
process.on('SIGUSR1', exitHandler.bind(null));
process.on('SIGUSR2', exitHandler.bind(null));
process.on('uncaughtException', exitHandler.bind(null));

function processFile(inputFile) {
    var fs = require('fs'),
        readline = require('readline'),
        instream = fs.createReadStream(inputFile),
        outstream = new (require('stream'))(),
        rl = readline.createInterface(instream, outstream);
     
    rl.on('line', function (line) {
        console.log(escape(line));
        if(line.length > 0) {
            db.query("select AddEvent(:data)",{params:{data:escape(line)}})            
        }    
        console.log('')
    });
    
    rl.on('close', function (line) {
        console.log('done reading file.');
    });
}
processFile(__dirname + '/e.txt');