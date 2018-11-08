const fs = require("fs")
eval(fs.readFileSync(__dirname + '/common.js')+'');

startLiveQuery("select from processcreate")

var _mapProcessCreate = new Map()
var _processCreateQ = []

// a fix function name that is used within startLiveQuery
function eventHandler(newpc) {
    var rid = '' + newpc['@rid']
    _mapProcessCreate.set(newpc['Hostname'] + newpc['ProcessGuid'], rid)
    //console.log('Wrote map ' + _mapProcessCreate.get(newpc['Hostname'] + newpc['ProcessGuid']) + ' for ' + newpc['Image'])
    fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ProcessGuid'], newpc['@rid'], function(err) { if(err) console.log(err) });
    if(newpc['ParentImage'] != 'System') {
        _processCreateQ.push(newpc)               
    }
}

setInterval(function(){ processQueue()},500);

function processQueue(){
    if(_processCreateQ.length == 0){ return }
    console.log('Queue length = ' + _processCreateQ.length)
    var newpc = _processCreateQ[0];
    var parentRID = _mapProcessCreate.get(newpc['Hostname'] + newpc['ParentProcessGuid'])
    if(parentRID) {
        //console.log('Linking ' + parentRID + ' TO ' + newpc['@rid'])
        connectParentOf(parentRID, newpc['@rid'])
        _processCreateQ.shift()
    }
    else {
        console.log('Searching database for parent of ' + newpc['Image'])
        _session.query("select @rid from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
        { params : {guid: newpc['ParentProcessGuid'], hostname: newpc['Hostname']}})
        .all()
        .then((data)=> {
            if(data.length > 0) {
                console.log('Found parent RID from DB for ' + newpc['Image'])
                //connectParentOf(data[0]['@rid'],newpc['@rid'])
                _mapProcessCreate.set(newpc['Hostname'] + newpc['ParentProcessGuid'], data[0]['@rid'])
                fs.writeFile(_cacheProcessCreateRID + '/' + newpc['Hostname'] + newpc['ProcessGuid'], data[0]['@rid'], function(err) { if(err) console.log(err) });
            }
            else {
                console.log('Cannot find parent for '+ newpc['Image'])
                _processCreateQ.shift()
            }
        });
    }
}

function connectParentOf(sourceRID, targetRID) {    
    //console.log('CREATE EDGE ParentOf FROM ' + sourceRID +' TO ' + targetRID)
    _session.command('CREATE EDGE ParentOf FROM ' + sourceRID +'  TO ' + targetRID)    
    .on('data',(results)=> {
        updateToBeProcessed(targetRID)
        updateParentOfSequence(targetRID)
    }) 
    .on('error',(err)=> {
        console.log('Retrying connectParentOfDirect for ' + sourceRID + ' to ' + targetRID)
        connectParentOf(sourceRID, targetRID)
    })   
}


function updateParentOfSequence(targetRID){
    _session.query("SELECT GetParentOfSequence('"+ targetRID + "') as seq")
    .on('data',(s)=> {
        _session.command('UPDATE ParentOfSequence set Sequence = :seq, Count = Count + 1 \
                         UPSERT RETURN AFTER @rid, Count WHERE Sequence = :seq',{ params : {seq: s['seq']}})
        .on('data',(c)=> {
            console.log('Sequence count: '+ c['Count'] + ':' + s['seq'])
            if(c['Count'] == 1) {
                _session.command('CREATE EDGE SequenceSighted from ' + c['@rid'] + ' TO ' + targetRID)
                .on('data', (ss) => {
                    console.log('Created SequenceSighted for ' + targetRID)
                })
            }
        })
    })
}
