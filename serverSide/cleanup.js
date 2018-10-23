var _session, _client, _handle;
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
