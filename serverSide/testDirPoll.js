const fs = require("fs")

var fileQueue = []

function checkFile(){
    if(fileQueue.length == 0) return
    console.log(fileQueue.length)
    if (!fs.existsSync(fileQueue[0])) {
        console.log(fileQueue[0] + ' deleted')
        fileQueue.shift();
        if(fileQueue.length > 0) checkFile();
    }
}

function pollDirectory(directory_to_monitor){
    fs.readdir(directory_to_monitor, function(err, items) {
        for (var i=0; i<items.length; i++) {
            if(fileQueue.indexOf(items[i]) >= 0) continue;
            if(items[i].indexOf('rotated') > 0 && items[i].indexOf('.txt') > 0) {
                console.log('added ' + items[i])
                fileQueue.push(items[i]);
            }
        }
    })
}

setInterval(function(){ pollDirectory('/Users/jymcheong/eventUpload')},1000)
setInterval(function(){ checkFile() },3000)