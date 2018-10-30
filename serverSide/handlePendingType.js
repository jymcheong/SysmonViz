const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from PendingType")

function eventHandler(newEvent) {
    setTimeout(checkUserActions, 20000, newEvent);
}

function checkUserActions(pendingEvent) {
    _session.query('SELECT FROM ' + pendingEvent['in'])
    .on('data',(results)=> {
        console.log(results)
        if(results['in_ActedOn']) return
        _session.command('UPDATE ' + pendingEvent['out'] + ' SET ProcessType = "AfterExplorerBackground"')
        .on('data',(hupc)=> {
            console.log('Updated HUPC ProcessType ' + pendingEvent['out'])
            _session.command('DELETE EDGE ' + pendingEvent['@rid'])
        })
    })
}