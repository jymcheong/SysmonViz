const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from PendingType")

function eventHandler(newEvent) {
    setTimeout(checkUserActions, 20000, newEvent);
}

function updateHUPCProcessType(hupc_rid, pendingEdge_rid){
    try{
        _session.command('UPDATE ' + hupc_rid + ' SET ProcessType = "AfterExplorerBackground"')
        .on('data',(hupc)=> {
            console.log('Updated HUPC ProcessType for ' + hupc_rid)
            _session.command('DELETE EDGE ' + pendingEdge_rid)
        })
    }
    catch(err){
        updateHUPCProcessType(hupc_rid, pendingEdge_rid)
    }
}

function checkUserActions(pendingEvent) {
    _session.query('SELECT FROM ' + pendingEvent['in']) // a ProcessCreate
    .on('data',(result)=> {        
        if(result['in_ActedOn']) return // it's AfterExplorerForeground, ignore
        updateHUPCProcessType(pendingEvent['out'],pendingEvent['@rid'])
    })
}