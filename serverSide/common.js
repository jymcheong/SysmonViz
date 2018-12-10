require('console-stamp')(console, 'HH:MM:ss.l')

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
var _handles = []
var _exiting = false

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
            _handles.push(_handle)
            if(_sessionStarted != null) _sessionStarted()
        })
    })
}

function connectODB(){
    return new Promise( (resolve, reject) => { 
        try {
            const OrientDBClient = require("orientjs").OrientDBClient
            OrientDBClient.connect({ host: _host ,port: _port})
            .then(client => {
                _client = client; //used in cleanup.js
                client.session({ name: _dbname, username: _user, password: _pass })
                .then(session => {
                    console.log('session opened')
                    _session = session //used in cleanup.js
                    resolve(session)                     
                })
            })
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

function closeDBsession(){
    if(_session){
        _session.close()
        .then(() =>{
            console.log('session closed');
            _session = null
            _client.close()
            .then(() => {
                console.log('client closed');
                _client = null
                process.exit();
            })
        })
    }
}

process.stdin.resume(); //so the program will not close instantly

function exitHandler(err) {
    if(_exiting) return;
    _exiting = true
    setTimeout(function(){ closeDBsession()},1000);
    if(err != null) console.log(err)
    console.log('cleaning up...')    
    var i = 0, j = _handles.length
    console.log('No of handles: ' + j)
    while(_handles.length > 0) {
        console.log('Unsubscribed handle #' + i++)
        _handles.shift().unsubscribe()
    }
}

process.on('exit', exitHandler.bind(null));
process.on('SIGINT', exitHandler.bind(null));
process.on('SIGUSR1', exitHandler.bind(null));
process.on('SIGUSR2', exitHandler.bind(null));
process.on('uncaughtException', exitHandler.bind('uncaughtException'));
