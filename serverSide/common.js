var _edgeLookup = {'ProcessTerminate':'Terminated', 'PipeCreated':'CreatedPipe',
                    'PipeConnected':'ConnectedPipe', 'RawAccessRead':'RawRead',
                    'FileCreateTime':'ChangedFileCreateTime', 'FileCreate':'CreatedFile',
                    'FileCreateStreamHash':'CreatedFileStream', 'RegistryEvent':'AccessedRegistry',
                    'NetworkConnect':'ConnectedTo', 'ImageLoad':'LoadedImage'}

var _session, _client, _handle;
var _cachedir = __dirname + '/cache';

var _host = '172.30.1.178';
var _port = 2424;
var _dbname = 'DataFusion';
var _user = 'root';
var _pass = 'Password1234'

if (!fs.existsSync(_cachedir)){
    fs.mkdirSync(_cachedir);
}

var _cacheProcessCreateRID = _cachedir + '/ProcessCreateRID'
if (!fs.existsSync(_cacheProcessCreateRID)){
    fs.mkdirSync(_cacheProcessCreateRID);
}

process.stdin.resume(); //so the program will not close instantly
function exitHandler(err) {
    if(err != null) console.log(err)
    console.log('cleaning up...')    
    _handle.unsubscribe()
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
process.on('exit', exitHandler.bind(null));
process.on('SIGINT', exitHandler.bind(null));
process.on('SIGUSR1', exitHandler.bind(null));
process.on('SIGUSR2', exitHandler.bind(null));
process.on('uncaughtException', exitHandler.bind('uncaughtException'));
