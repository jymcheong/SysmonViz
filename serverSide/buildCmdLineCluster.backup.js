const jw = require('jaro-winkler');
const _threshold = 0.80

var HUPCs = fs.readFileSync('/Users/jymcheong/Desktop/HUPCdata.json', "utf8");
var parsed = JSON.parse(HUPCs)

var previous_str = ''
var clusters = {}

for(i =0; i < parsed['result'].length; i++){
    var clusterhead = '' + parsed['result'][i]['CommandLine']
    clusterhead = clusterhead.split(' ')[0]
    var similarity = jw(previous_str,parsed['result'][i]['CommandLine'])
    if(similarity > _threshold) {
        console.log('Similar to previous: ' + parsed['result'][i]['CommandLine'])
        clusters[clusterhead] += 1
    }
    else {
        console.log('Checking with clusters...')
        var found = false
        for(var key in clusters) {
            similarity = jw(clusters[key], parsed['result'][i]['CommandLine'])
            if(similarity > _threshold) {
                found = true
                break
            }
        }
        if(found == false) {
            console.log(similarity + ' Creating a new cluster for dissimilar string: ' + parsed['result'][i]['CommandLine'])
            clusters[clusterhead] = parsed['result'][i]['CommandLine']
        }
    }
    previous_str = parsed['result'][i]['CommandLine'];
}

console.log('Cluster size: ' + Object.keys(clusters).length)