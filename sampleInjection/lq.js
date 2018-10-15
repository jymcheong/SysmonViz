const OrientDBClient = require("orientjs").OrientDBClient;
var _session, _client, _handle;

OrientDBClient.connect({
  host: "localhost",
  port: 2424
}).then(client => {
    _client = client;
    client.session({ name: "DataFusion", username: "root", password: "Password1234" })
    .then(session => {
    // use the session
       console.log('session opened')
       _session = session;
       _handle = session.liveQuery("select from ProcessCreate").on("data", data => {
//       _handle = session.liveQuery("select from parentof").on("data", data => {
            console.log(data);
        });
    })
});

process.stdin.resume(); //so the program will not close instantly
function exitHandler(err) {
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
process.on('uncaughtException', exitHandler.bind(null));
