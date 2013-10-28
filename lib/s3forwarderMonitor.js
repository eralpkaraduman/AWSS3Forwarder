var program = require('commander');
var forever = require('forever');
var express = require('express');
var routes = require('../routes');
var user = require('../routes/user');
var http = require('http');
var path = require('path');
var util = require('util');
var fs = require('fs');

var forwarder = require('./s3forwarder');


var app = express();

app.set('port', process.env.PORT || 5050);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));



// development only
if ('development' == app.get('env')) {
    app.use(express.errorHandler());
}

//app.get('/',routes.index);

app.get('/',function(req,res){
    var html = "<a href='/queue'>queue</a>";
    html += "<br>";
    html += "<a href='/failed'>failed</a>";
    html += "<br>";
    html += "<a href='/current'>current</a>";



    res.end(html);
});

app.get('/queue',function(req,res){
    res.end(JSON.stringify(forwarder.getQueue(),null,4));
});

app.get('/failed',function(req,res){
    res.end(JSON.stringify(forwarder.getFailedQueue(),null,4));
});

app.get('/current',function(req,res){
    res.end(JSON.stringify(forwarder.getCurrentUpload(),null,4));
});

http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
});

function currentProgramPath(){
    return path.resolve(__dirname, 's3forwarder.js')
}

function findWebServerProcess(cb){
    forever.list (false, function(err,processes){

        var ps = [];

        if(err){
            cb(ps);
        }else if(processes){

            for(var i=0; i<processes.length; i++){
                var p =  processes[i];
                if(p.file == currentProgramPath()){
                    p.foreverIndex = i;
                    ps.push(p);
                }
            }

            cb(ps);
        }else{
            cb(ps);
        }


    });
}