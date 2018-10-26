const fs = require("fs")
const _cachedir = __dirname + '/RIDcache';
eval(fs.readFileSync(__dirname + '/cleanup.js')+'');

// this will hold the HostnameProcessGuid -> @rid
if (!fs.existsSync(_cachedir)){
    fs.mkdirSync(_cachedir);
}

const OrientDBClient = require("orientjs").OrientDBClient
OrientDBClient.connect({ host: "172.30.1.178",port: 2424})
.then(client => {
    _client = client; //used in cleanup.js
    client.session({ name: "DataFusion", username: "root", password: "Password1234" })
    .then(session => {
        console.log('session opened')
        _session = session //used in cleanup.js
        _handle = session.liveQuery("select from processcreate") //used in cleanup.js
        .on("data", data => {
            if(data['operation'] != 1) return               
            console.log('Processing ' + data['data']['Image'] + ' from ' + data['data']['Hostname']);
            findParent(data['data'])
        })
    })
})

function connectParentOf(sourceRID, targetRID) {
    console.log('creating ParentOf from ' + sourceRID + ' to ' + targetRID)
    _session.command('CREATE EDGE ParentOf FROM ' + sourceRID + ' TO ' + targetRID)
    .on('data',(results)=> {
        //console.log("Updating ToBeProcessed for " + targetRID)
        _session.command('Update ' + targetRID + 'SET ToBeProcessed = false')
        .on('error',(err)=> {
            console.log(err)
            console.log('Retrying update...')
            _session.command('Update ' + targetRID + 'SET ToBeProcessed = false')
        })
        .on('data',(data)=> {
            console.log('updated processcreate ' + targetRID)
            // do 'gaps once here
        })
        // get parentOf sequence
    })
    .on('error',(err)=> {
        console.log('Retrying creating ParentOf from ' + sourceRID + ' to ' + targetRID)
        connectParentOf(sourceRID, targetRID)
    })
}

function findParent(newpc) {
    // write new @rid to cache folder
    fs.writeFile(_cachedir + '/' + newpc['Hostname'] + newpc['ProcessGuid'], newpc['@rid'], function(err) { if(err) console.log(err) });
    // find parent @rid in cache
    fs.readFile(_cachedir + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], function(err, parentrid){
        if(err) { // not in cache, find in database
            console.log('Cannot find parent rid in cache, trying database...')
            _session.query("select @rid from (select from processcreate where ProcessGuid = :guid) where Hostname = :hostname", 
            { params : {guid: newpc['ParentProcessGuid'], hostname: newpc['Hostname']}})
            .all()
            .then((results)=> {
                if(results.length == 0) {
                    console.log('cannot find parent for ' + newpc['@rid'])
                    return
                }
                fs.writeFile(_cachedir + '/' + newpc['Hostname'] + newpc['ParentProcessGuid'], results[0]['@rid'], function(err) { if(err) console.log(err) });
                connectParentOf(results[0]['@rid'], newpc['@rid'])
            });
            return
        }
        connectParentOf(parentrid, newpc['@rid'])
    })   
}
