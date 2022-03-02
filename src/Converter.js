const Events = require('./Events');
const Parser = require('./Parser');
const Commands = require('./Commands');
const {
    LineSeparate,VerseSeparate,
    SetLineProperty,SetVerseProperty,
    TimingEvent
} = require('./util_classes');

const STAKATO_TIME = 10;

function cloneObject(obj){
    var newobj = {};
    for(var i in obj){
        if(typeof obj[i] == 'object'){
            if(obj[i] instanceof Array) newobj[i] = [...obj[i]];
            else newobj[i] = cloneObject(obj[i]);
        }
        else newobj[i] = obj[i];
    }

    return newobj;
}

function classifyHeader(headers,copyrightProtect = false){
    var headers = cloneObject(headers);
    var classified = {
        files:{},
        meta:{},
        otherHeaders:null
    };

    for(var i in headers){
        if(copyrightProtect ? i.match(/^\@file-/g) : i.match(/^file-/g)){
            classified.files[i.replace(/(@?)file-/i,'')] = headers[i];
            delete headers[i];
        }
        else if(i.match(/^meta-/g)){
            classified.meta[i.replace('meta-','')] = headers[i];
            delete headers[i];
        }
    }

    classified.otherHeaders = headers;

    return classified;
}

function convertLine(line){
    //console.log(line.txt);
    let syllables = line.syllables = Parser.parseSentence(line.txt); // 음절
    //console.log(syllables,line.txt);
    delete line.txt;
    let lineData = [];
    let oldData = [...line.data];
    let slength = syllables
    .map(a => a.filter(aa => typeof aa == 'string').join('').trim())
    .filter(a => a).length;
    if(oldData.length < slength){
        // 추가로 넣어야 할 타이밍 이벤트의 수
        let cnt = syllables.length-oldData.length+1;
        let event = oldData.pop();
        let duration = (event.end-event.start)/cnt;
        let ptime = event.start;
        for(let i = 0;i < cnt;i++) oldData.push(new TimingEvent(Math.round(ptime+duration*i),Math.round(ptime+duration*(i+1)),event.currentBPM));
    }else if(oldData.length > slength){
        // 타이밍 이벤트 합치기
        oldData[slength-1].end = oldData.pop().end;
        while(oldData.length > slength){
            oldData.pop();
        }
        //console.log(oldData,syllables)
    }
    // 가사를 중간에 멈출 수 없도록 막음
    for(let i in oldData){ oldData[i].end = oldData[i-(-1)] ? oldData[i-(-1)].start : oldData[i].end; }

    // 타이밍 데이터에 직접 가사내용을 넣진 않음
    for(let syll of syllables){
        if(syll[0] == ' '){
            lineData.push({
                start:lineData[lineData.length-1].end,
                end:lineData[lineData.length-1].end
            });
        }else{
            try{
                let block = oldData.shift();
                lineData.push(block);
            }catch(e){
                console.log(syllables);
                throw e;
            }
        }
    }
    line.data = lineData;
    return line;
}

module.exports = class Converter{
    static parseCommandWithTickDuration(commands,headers){
        var bpm = 120;
        var stringEvents = [];
        var ticksPerBeat = headers.meta['ticks-per-beat'] || 120;
        var playtime = 0;
        for(var cmd of commands){
            switch(cmd.type.toLowerCase()){
                case 'c':{
                    let { name,opts } = Commands.parse(cmd.cmd);
                    let { _unknown:args } = opts;
                    switch(name.toLowerCase()){
                        case 'bpm':{
                            bpm = Parser.parseNumber(args[0]);
                        }break;
                        case 'show':{
                            stringEvents.push(new SetVerseProperty('waitTime',Parser.parseDuration(args[0],bpm,ticksPerBeat).reduce((a,b) => a+b.ms,0)));
                        }break;
                        case 'count':{
                            stringEvents.push(new SetVerseProperty('count',parseInt(args[0],10)));
                        }break;
                        case 'delay':{
                            playtime += Parser.parseDuration(args[0],bpm,ticksPerBeat).reduce((a,b) => a+b.ms,0);
                        }break;
                        case 'delay_ms':{
                            playtime += Parser.parseNumber(args[0]);
                        }break;
                    }
                }break;
                case 't':{
                    cmd.timings.forEach(time => {
                        let start = playtime;
                        let parsed = Parser.parseDuration(time,bpm,ticksPerBeat);
                        let splitTimes = [];
                        let splitRatio = [];
                        parsed.forEach(a => {
                            splitTimes.push(playtime += a.ms);
                            splitRatio.push(a.ratio);
                        });
                        splitTimes.pop();
                        //playtime += parsed.ms;
                        let end = parsed[parsed.length-1].stakato ? (splitTimes[splitTimes.length-1] || start)+STAKATO_TIME : playtime;
                        stringEvents.push(new TimingEvent(Math.round(start),Math.round(end),bpm,splitTimes,splitRatio));
                    });
                }break;
                case 'l':{
                    if(cmd.end){
                        let endTime = parseFloat(cmd.endTime) ? cmd.endTime : 0;
                        stringEvents.push(new VerseSeparate((typeof cmd.endTime != 'undefined')
                        ? Parser.parseDuration(endTime,bpm,ticksPerBeat).reduce((a,b) => a+b.ms,0) : 0));
                    }else{
                        stringEvents.push(new LineSeparate());
                    }
                }break;
                case 's':{
                    stringEvents.push(new SetLineProperty('txt',cmd.sentence));
                }break;
                case 'u':{
                    stringEvents.push(new SetLineProperty('sub',cmd.sentence));
                }break;
                case 'p':{
                    stringEvents.push(new SetLineProperty('type',cmd.typecode));
                }break;
            }
        }

        return stringEvents;
    }

    static convert(data,copyrightProtect = false){
        var { headers,commands } = Parser.parse(data);
        var classifiedHeaders = classifyHeader(headers,copyrightProtect);
        var events = new Events();
        var stringEvents = null;
        var verses = [];

        switch(classifiedHeaders.meta['timing-type']){
            case 'tick-duration':{
                stringEvents = this.parseCommandWithTickDuration(commands,classifiedHeaders);
            }break;
            case 'ms-timing':{
                stringEvents = this.parseCommandWithMsTiming(commands,classifiedHeaders);
            }break;
            default:{
                stringEvents = this.parseCommandWithTickDuration(commands,classifiedHeaders);
            }break;
        }

        if(true){
            let first = true;
            let initialVerse = {
                startBPM:120,
                onEndHideDelay:0,
                lines:[]
            };
            let initialLine = {
                type:0,
                sub:'',
                data:[],
                txt:''
            };
            let verse = cloneObject(initialVerse);
            let line = cloneObject(initialLine);

            for(var event of stringEvents){
                if(event instanceof LineSeparate){
                    verse.lines.push(convertLine(line));
                    line = cloneObject(initialLine);
                }else if(event instanceof VerseSeparate){
                    first = true;
                    verse.lines.push(convertLine(line));
                    line = cloneObject(initialLine);
                    verse.onEndHideDelay = event.hideDelay;
                    verses.push(verse);
                    verse = cloneObject(initialVerse);
                }else if(event instanceof SetLineProperty){
                    line[event.key] = event.val;
                }else if(event instanceof SetVerseProperty){
                    verse[event.key] = event.val;
                }else if(event instanceof TimingEvent){
                    if(first){
                        verse.startBPM = event.currentBPM;
                        first = false;
                    }
                    line.data.push(event);
                }
            }
            if(line.data.length){
                verse.lines.push(convertLine(line));
                line = cloneObject(initialLine);
            }

            if(verse.lines.length){
                first = true;
                if(line.length) verse.lines.data.push(line);

                line = cloneObject(initialLine);
                verses.push(verse);
            }
        }

        var lastEndTime = 0;
        var verseRanges = [];
        var first = true;
        for(var verse of verses){
            let startCount = 4;
            let startTime = verse.lines[0].data[0].start;
            let ganjuDuration = verse.lines[0].data[0].start-lastEndTime;
            let beat = 60000/verse.startBPM;
            let verseRange = [0,0];
            let beatBase = 60000/190;
            if(ganjuDuration <= beat*20 && ganjuDuration <= beatBase*20) startCount = 3;
            if(ganjuDuration <= beat*15 && ganjuDuration <= beatBase*15) startCount = 2;
            if(ganjuDuration <= beat*10 && ganjuDuration <= beatBase*10) startCount = 1;
            if(ganjuDuration <= beat*4) startCount = 0;
            let firstRender = startTime;

            let bottom = false;
            if(verse.lines.length < 2) bottom = true;
            startCount = Math.round(Math.max(0,Math.min(verse.count,4))) || startCount;
            for(var i = 1;i <= startCount;i++){
                events.add(startTime-(beat*i),'countdown',{ val:i,bottom });
                firstRender = Math.min(firstRender,startTime-(beat*i));
            }

            for(var i = 1;i <= Math.max(0,4-startCount);i++){
                events.add(firstRender-i*10,'countdown',{ val:i-startCount,bottom });
            }
            events.add(startTime,'countdown',{ val:null,bottom });
            let initialMinus = 200;
            let minus = initialMinus;
            if(ganjuDuration > 25000 && first) minus = Math.min(6000,ganjuDuration/2);
            if(verse.waitTime) minus = Math.max(verse.waitTime,initialMinus);
            firstRender = Math.max(firstRender-minus,0);
            verseRange[0] = firstRender-10;

            if(verse.lines.length < 2){
                events.add(firstRender,'renderlyrics',{
                    lineCode:'b',
                    data:verse.lines[0]
                });
                verseRange[1] = (verse.lines[0].data[verse.lines[0].data.length-1].end+verse.onEndHideDelay)+10;
                events.add(lastEndTime = verse.lines[0].data[verse.lines[0].data.length-1].end+verse.onEndHideDelay,'hidelyrics',{});
            }else{
                events.add(firstRender,'renderlyrics',{
                    lineCode:'a',
                    data:verse.lines[0]
                });
                events.add(firstRender+125,'renderlyrics',{
                    lineCode:'b',
                    data:verse.lines[1]
                });
                let lines = [...verse.lines];
                lines.shift();

                let first = true;
                let lineCode = true; // true:a,false:b
                for(var i in lines){
                    if(first){ first = false; continue; }
                    if(!lines[i-1].data.length) continue;
                    events.add(lines[i-1].data[0].start+(lines[i-1].data[0].end-lines[i-1].data[0].start)/2,'renderlyrics',{
                        lineCode:lineCode ? 'a' : 'b',
                        data:lines[i]
                    });
                    lineCode = !lineCode;
                }
                let endTime = lastEndTime = [...([...verse.lines].reverse()[0]).data].reverse()[0].end+verse.onEndHideDelay;
                events.add(endTime,'hidelyrics',{});
                verseRange[1] = endTime;
            }
            verseRanges.push(verseRange);
            first = false;
        }

        if(true){
            let keys = Object.keys(events.getAll());
            let firsteventtime = Math.min(...keys);
            firsteventtime = Math.max(firsteventtime-1600,0);
            events.add(Math.min(10000,firsteventtime),'cleangui',{},true);
            events.add(0,'hidelyrics',{},true);
        }

        classifiedHeaders.media = '';
        if(classifiedHeaders.files.yjk || classifiedHeaders.files.midi){
            if(classifiedHeaders.files.yjk){
                classifiedHeaders.media += 'yjk';
            }else if(classifiedHeaders.files.midi){
                classifiedHeaders.media += 'midi';
            }
            classifiedHeaders.media += '-';
            if(classifiedHeaders.files.mv){
                classifiedHeaders.media += 'mv';
            }else{
                classifiedHeaders.media += 'only';
            }
        }else{
            if(classifiedHeaders.files.mr && classifiedHeaders.files.mv){
                classifiedHeaders.media = 'mr-mv';
            }else if(classifiedHeaders.files.mr && !classifiedHeaders.files.mv){
                classifiedHeaders.media = 'mr-only';
            }else if(!classifiedHeaders.files.mr && classifiedHeaders.files.mv){
                classifiedHeaders.media = 'mv-only';
            }
        }

        if(classifiedHeaders.media == 'yjk-mv' || classifiedHeaders.media == 'midi-mv' || classifiedHeaders.media == 'mr-mv'){
            let time = classifiedHeaders.otherHeaders['mv-timing'] || 0;
            events.add(time,'playmv',{},true);
        }

        return {
            headers:classifiedHeaders,
            rawHeaders:headers,
            events:events.getAll(),
            verseRanges,
            debug:{
                verses:verses,commands
            }
        };
    }
}