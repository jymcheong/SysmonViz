var _edgeLookup = {'ProcessTerminate':'Terminated', 'PipeCreated':'CreatedPipe',
                    'PipeConnected':'ConnectedPipe', 'RawAccessRead':'RawRead',
                    'FileCreateTime':'ChangedFileCreateTime', 'FileCreate':'CreatedFile',
                    'FileCreateStreamHash':'CreatedFileStream', 'RegistryEvent':'AccessedRegistry',
                    'NetworkConnect':'ConnectedTo', 'ImageLoad':'LoadedImage'}

const fs = require("fs")
eval(fs.readFileSync(__dirname + '/cleanup.js')+'');

const OrientDBClient = require("orientjs").OrientDBClient
OrientDBClient.connect({ host: "172.30.1.178",port: 2424})
.then(client => {
    _client = client; //used in cleanup.js
    client.session({ name: "DataFusion", username: "root", password: "Password1234" })
    .then(session => {
        console.log('session opened')
        _session = session //used in cleanup.js
        _handle = session.liveQuery("select from V") //used in cleanup.js
        .on("data", data => {
            if(data['operation'] == 1) findProcessCreate(data['data'])
        })
    })
})

function linkNewEvent(classname, sourceRID, targetRID){
        //console.log(classname + ' link ' + sourceRID + ' to ' + targetRID)
        sql = 'CREATE EDGE ' + _edgeLookup[classname] + ' FROM ' + sourceRID + ' TO ' + targetRID
        _session.command(sql)
        .on("data", data => {
            console.log('Connected ' + _edgeLookup[classname] + ' FROM ' + sourceRID + ' TO ' + targetRID)
            _session.command('UPDATE '+ targetRID + ' SET ToBeProcessed = false')
        })
        .on('error',(err)=> {
            console.log(err)
        })
        // if ProcessTerminate, clean up file cache....
}

function findProcessCreate(newEvent) {
    if(newEvent['Image'] == 'System') return
    switch(newEvent['@class']){
        case "ProcessTerminate"://ID5: ProcessCreate-[Terminated]->ProcessTerminate     	
        case "PipeCreated":	    //ID17: ProcessCreate-[CreatedPipe]->PipeCreated	
        case "PipeConnected":   //ID18: ProcessCreate-[ConnectedPipe]->PipeConnected
        case "RawAccessRead":   //ID9: ProcessCreate-[RawRead]->RawAccessRead
        case "FileCreateTime":  //ID2: ProcessCreate-[ChangedFileCreateTime]->FileCreateTime	
        case "FileCreate": 	    //ID11: ProcessCreate-[CreatedFile]->FileCreate 
        case "FileCreateStreamHash": //ID15: ProcessCreate-[CreatedFileStream]->FileCreateStreamHash    
        case "RegistryEvent":   //ID13&14: ProcessCreate-[AccessedRegistry]->RegistryEvent
        case "NetworkConnect":  //ID3: ProcessCreate-[ConnectedTo]->NetworkConnect 
            // find processcreate @rid from cache
            fs.readFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], function(err, processCreateRid){
                if(err) { // not in cache, find in database
                    console.log('Trying database to find for ' + newEvent['@rid']+ '...')
                    _session.query("select @rid from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
                    { params : {guid: newEvent['ProcessGuid'], hostname: newEvent['Hostname']}})
                    .all()
                    .then((results)=> {
                        if(results.length == 0) {
                            console.log('cannot find processcreate for ' + newEvent['@rid'])
                        }
                        else {
                            fs.writeFile(_cacheProcessCreateRID + '/' + newEvent['Hostname'] + newEvent['ProcessGuid'], results[0]['@rid'], function(err) { if(err) console.log(err) });
                            linkNewEvent(newEvent['@class'],results[0]['@rid'], newEvent['@rid'])
                        }
                    });
                }
                else{
                    linkNewEvent(newEvent['@class'],processCreateRid, newEvent['@rid'])
                }
            })   
            break;
    }
}
