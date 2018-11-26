var _edgeLookup = {'ProcessTerminate':'Terminated', 'PipeCreated':'CreatedPipe',
                    'PipeConnected':'ConnectedPipe', 'RawAccessRead':'RawRead',
                    'FileCreateTime':'ChangedFileCreateTime', 'FileCreate':'CreatedFile',
                    'FileCreateStreamHash':'CreatedFileStream', 'RegistryEvent':'AccessedRegistry',
                    'NetworkConnect':'ConnectedTo', 'ImageLoad':'LoadedImage'}

var _session, _client, _handle;
var _cachedir = __dirname + '/cache';
var _host = '127.0.0.1';
var _port = 2424;
var _dbname = 'DataFusion';
var _user = 'root';
var _pass = 'Password1234'
var _sessionStarted = null

require('console-stamp')(console, 'HH:MM:ss.l')

if (!fs.existsSync(_cachedir)){
    fs.mkdirSync(_cachedir);
}

var _cacheProcessCreateRID = _cachedir + '/ProcessCreateRID'
if (!fs.existsSync(_cacheProcessCreateRID)){
    fs.mkdirSync(_cacheProcessCreateRID);
}

function startLiveQuery(stm){
    const OrientDBClient = require("orientjs").OrientDBClient
    OrientDBClient.connect({ host: _host ,port: _port})
    .then(client => {
        _client = client; //used in cleanup.js
        client.session({ name: _dbname, username: _user, password: _pass })
        .then(session => {
            console.log('session opened')
            _session = session //used in cleanup.js
            _handle = session.liveQuery(stm) //used in cleanup.js
            .on("data", data => {
                if(data['operation'] == 1) eventHandler(data['data'])
            })
            if(_sessionStarted != null) _sessionStarted()
        })
    })
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

function closeDBsession(){
    _session.close()
    .then(() =>{
        console.log('session closed');
        _client.close()
        .then(() => {
            console.log('client closed');
            process.exit();
        })
    })
}

process.stdin.resume(); //so the program will not close instantly
function exitHandler(err) {
    if(err != null) console.log(err)
    console.log('cleaning up...')    
    if(_handle) {
        _handle.unsubscribe()
        setInterval(function(){ closeDBsession()},600);
    }
    else {
        closeDBsession()
    }
}

process.on('exit', exitHandler.bind(null));
process.on('SIGINT', exitHandler.bind(null));
process.on('SIGUSR1', exitHandler.bind(null));
process.on('SIGUSR2', exitHandler.bind(null));
process.on('uncaughtException', exitHandler.bind('uncaughtException'));
