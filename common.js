require('console-stamp')(console, 'yyyy-mm-dd HH:MM:ss.l')

var _session = null, _client = null, _handle = null;
var _cachedir = __dirname + '/cache';
var _host = '127.0.0.1';
var _port = 2424;
var _dbname = 'SysmonViz';
var _user = 'root';
var _pass = 'Password1234'
var _sessionStarted = null
var _handles = []
var _exiting = false

const http = require('http'); // turn off INFO else server console flooded
var url = "/server/log.console/WARNING";
var options = {
    host: _host,
    port: 2480,
    method: "POST",
    path: url,//I don't know for some reason i have to use full url as a path
    auth: _user + ':' + _pass
};
http.get(options, function(rs) {
    var result = "";
    rs.on('data', function(data) {
        result += data;
    });
    rs.on('end', function() {
        console.log(result);
    });
});


async function startLiveQuery(stm){
    const OrientDBClient = require("orientjs").OrientDBClient
    _client = await OrientDBClient.connect({ host: _host ,port: _port})
    _session = await _client.session({ name: _dbname, username: _user, password: _pass })
    console.log('session opened')
    _handle = await _session.liveQuery(stm).on("data", data => {
        if(data['operation'] == 1) eventHandler(data['data'])
    })
    _handles.push(_handle)
    if(_sessionStarted != null) _sessionStarted() // assign to a function that runs upon start of DB session
}

function connectODB(){
    return new Promise( async(resolve, reject) => { 
        try {
            const OrientDBClient = require("orientjs").OrientDBClient
            _client = await OrientDBClient.connect({ host: _host ,port: _port})
            _session = await _client.session({ name: _dbname, username: _user, password: _pass })
            resolve(_session)                     
        }
        catch(err) {
            reject(err)
        }
    });
}

function updateToBeProcessed(targetRID){
    _session.command('Update ' + targetRID + 'SET ToBeProcessed = false')
    .on('data',(data)=> {
        //console.log('updated ToBeProcessed to false for ' + targetRID)
    })
    .on('error',(err)=> {
        console.log('Retrying ToBeProcessed update... for '+ targetRID)
        updateToBeProcessed(targetRID)
    })
}

async function closeDBsession(){
    if(_session){
        await _session.close()
        console.log('session closed');
        _session = null
        await _client.close()
        console.log('client closed');
        _client = null
        process.exit();
    }
}

process.stdin.resume(); //so the program will not close instantly

async function exitHandler(err) {
    if(_exiting) return;
    _exiting = true
    console.log('cleaning up...')    
    if(err != null) console.log(err)
    var i = 0, j = _handles.length
    console.log('No of handles: ' + j)
    while(_handles.length > 0) {
        console.log('Unsubscribed handle #' + i++)
        await _handles.shift().unsubscribe()
    }
    closeDBsession();
}

process.on('exit', exitHandler.bind(null));
process.on('SIGINT', exitHandler.bind(null));
process.on('SIGUSR1', exitHandler.bind(null));
process.on('SIGUSR2', exitHandler.bind(null));
process.on('uncaughtException', exitHandler.bind('uncaughtException'));
