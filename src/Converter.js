const CommandConverter = require('./CommandConverter');
const Events = require('./Events');
const Parser = require('./Parser');
const {
    LineSeparate,VerseSeparate,
    SetLineProperty,SetVerseProperty,
    TimingEvent
} = require('./util_classes');

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

function classifyHeader(headers2){
    let headers = cloneObject(headers2);
    let files = {};

    for(let i in headers){
        if(i.match(/^file-/g)){
            files[i.replace(/(@?)file-/i,'')] = headers[i];
            delete headers[i];
        }else if(i.match(/^meta-/g)){
            // meta-로 시작하는 헤더의 meta- 부분을 없애서 새로 넣음
            headers[i.replace('meta-','')] = headers[i];
            delete headers[i];
        }
    }

    if(!files.audio && files.mr) files.audio = files.mr;
    headers.files = files;

    return headers;
}

function convertLine(line,forceStartCount){
    //console.log(line.txt);
    // 음절 나누기(ruby와 body가 따로 분리되어 있음)
    let syllables = line.syllables = Parser.parseSentence(line.txt);
    //console.log(syllables,line.txt);
    delete line.txt;
    let lineData = [];
    let oldData = [...line.timings];
    
    // 음절에서 띄어쓰기(' ')를 제외한 length
    let slength = syllables.body
    .map(a => a.body.trim())
    .filter(a => a).length;
    if(oldData.length < slength){
        // 추가로 넣어야 할 타이밍 이벤트의 수
        let cnt = syllables.body.length-oldData.length+1;
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

    // 타이밍 데이터에 직접 가사내용을 넣진 않음
    syllables.body.forEach((syll,i,sylls) => {
        if(syll.body == ' '){
            lineData.push({
                start:lineData[lineData.length-1].end,
                end:sylls[i+1] ? sylls[i+1].start : lineData[lineData.length-1].end
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
    });
    
    // 띄어쓰기가 아닌 곳에서 가사를 중간에 멈출 수 없도록 막음
    for(let i in lineData){ lineData[i].end = lineData[i-(-1)] ? lineData[i-(-1)].start : lineData[i].end; }

    line.timings = lineData;
    line.legacy.forceStartCount = forceStartCount;
    line.params.startCount = line.params.startCount || line.legacy.forceStartCount;
    return line;
}

const defaultOptions = {
    headerOnly:false
};

const LINE_0 = 0;
const LINE_1 = 1;
const LINE_2 = 2;

module.exports = class Converter{
    static convert(data,opts){
        return this.convertParsed(Parser.parse(data),opts);
    }
    
    static convertParsed({ headers,commands },opts){
        opts = Object.assign({
            enableMsec:false
        },opts);
        var classifiedHeaders = classifyHeader(headers);
        var events = new Events();
        var stringEvents = null;
        var verses = [];
        classifiedHeaders['ticks-per-beat'] = classifiedHeaders['ticks-per-beat'] || 120;

        /*classifiedHeaders.media = '';
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
            if(classifiedHeaders.files.audio && classifiedHeaders.files.mv){
                classifiedHeaders.media = 'audio-mv';
            }else if(classifiedHeaders.files.audio && !classifiedHeaders.files.mv){
                classifiedHeaders.media = 'audio-only';
            }else if(!classifiedHeaders.files.audio && classifiedHeaders.files.mv){
                classifiedHeaders.media = 'mv-only';
            }
        }*/
        
        // 결과 변수를 미리 만들어둠
        let convertedResult = {
            headers:classifiedHeaders,
            rawHeaders:headers
        };
        
        /*convertedResult.headers.useMsec = !((classifiedHeaders.media.startsWith('midi')
        || classifiedHeaders.media.startsWith('yjk')) || classifiedHeaders.otherHeaders['tempo-changes']);*/
        convertedResult.headers.useMsec = !(classifiedHeaders['tempo-changes']);
        let isMidi = classifiedHeaders.files.midi;

        /*switch(classifiedHeaders.meta['timing-type']){
            case 'std-duration':{
                convertedResult.headers.useMsec = true;
                stringEvents = CommandConverter.parseCommandWithStdDuration(commands,classifiedHeaders);
            }break;
            case 'playtime-duration':{
                stringEvents = CommandConverter.parseCommandWithPlaytimeDuration(commands,classifiedHeaders);
            }break;
            default:{
                stringEvents = convertedResult.headers.useMsec
                ? CommandConverter.parseCommandWithStdDuration(commands,classifiedHeaders)
                : CommandConverter.parseCommandWithPlaytimeDuration(commands,classifiedHeaders);
            }break;
        }*/
        stringEvents = convertedResult.headers.useMsec
        ? CommandConverter.parseCommandWithStdDuration(commands,classifiedHeaders,!isMidi || opts.enableMsec)
        : CommandConverter.parseCommandWithPlaytimeDuration(commands,classifiedHeaders);
        
        let lyricLines = [];
        if(true){
            let first = true;
            let initialVerse = {
                startBPM:120,
                onEndHideDelay:0,
                lines:[]
            };
            let initialLine = {
                params:{},
                sub:'',
                timings:[],
                txt:'',
                legacy:{}
            };
            let verse = cloneObject(initialVerse);
            let line = cloneObject(initialLine);
            let forceStartCount = false;

            for(var event of stringEvents){
                if(event instanceof LineSeparate){
                    let convertedLine = convertLine(line,forceStartCount);
                    verse.lines.push(convertedLine);
                    lyricLines.push(convertedLine);
                    forceStartCount = event.forceStartCount;
                    line = cloneObject(initialLine);
                }else if(event instanceof VerseSeparate){
                    first = true;
                    let convertedLine = convertLine(line,forceStartCount);
                    verse.lines.push(convertedLine);
                    lyricLines.push(convertedLine);line = cloneObject(initialLine);
                    verse.onEndHideDelay = event.hideDelay;
                    verses.push(verse);
                    verse = cloneObject(initialVerse);
                }else if(event instanceof SetLineProperty){
                    if(event.key == 'type'){
                        line.params.style = event.val;
                    }else{
                        line[event.key] = event.val;
                    }
                }else if(event instanceof SetVerseProperty){
                    verse[event.key] = event.val;
                }else if(event instanceof TimingEvent){
                    if(first){
                        verse.startBPM = event.currentBPM;
                        line.params.startCount = true;
                        first = false;
                    }
                    line.timings.push(event);
                }
            }
            if(line.timings.length){
                let convertedLine = convertLine(line,forceStartCount);
                verse.lines.push(convertedLine);
                lyricLines.push(convertedLine);
                line = cloneObject(initialLine);
            }
            
            if(verse.lines.length){
                verses.push(verse);
            }
        } // 이거 if문 닫는거임(if(true){} 꼴)
        
        // BPMChanges 헤더에 값이 있으면 파싱한 뒤 그에 맞춰 밀리초로 변환
        // 형식:'시간:bpm,시간:bpm,시간:bpm,....'
        // 예시:'0:110,3600:100,120:90,120:82,120:75,120:70,120:60,120:50,120:45,120:160'
        // 시간은 틱단위이며 가사파일 기준임(여기서 파싱을 하므로)
        let bpmlist = null,bpmevents = null;
        if(classifiedHeaders['tempo-changes'] && !convertedResult.headers.useMsec){
            //console.log(classifiedHeaders.otherHeaders['tempo-changes']);
            //console.log('progress A');
            convertedResult.headers.useMsec = true;
            bpmlist = classifiedHeaders['tempo-changes']
            .split(',').map(a => a.split(':'))
            .map(a => ({ time:parseFloat(a[0]),bpm:parseFloat(a[1]) }));
            bpmevents = {};
            let playms = 0;
            let playtick = 0;
            //console.log('progress B');
            for(let i in bpmlist){
                let e = {...bpmlist[i]};
                playtick += e.time;
                bpmlist[i].time = playtick;
                //if(!bpmevents[e.time]) bpmevents[e.time] = [];
                playms += 60000/(bpmlist[i-1] ? bpmlist[i-1].bpm : 120)*(e.time/classifiedHeaders['ticks-per-beat']);
                //bpmevents[e.time].push({ playms,bpm:e.bpm });
                bpmlist[i].playms = playms;
            }
            bpmlist = bpmlist.sort((a,b) => a.time-b.time);
            let revbpmlist = [...bpmlist].reverse();
            function convf(val){
                for(let g of revbpmlist){
                    if(g.time < val){
                        return Math.round(
                            ((val - g.time)
                            / classifiedHeaders['ticks-per-beat']
                            * (60000/g.bpm)) + g.playms
                        );
                    }
                }
            }
            function getBPM(time){
                for(let g of revbpmlist){
                    if(g.time < time){
                        return g.bpm;
                    }
                }
            }
            //console.log('progress C');
            for(let i in verses){
                let startPoint = verses[i].lines[0].timings[0].start;
                for(let j of revbpmlist){
                    if(j.time < startPoint){
                        verses[i].startBPM = j.bpm; break;
                    }
                }
                for(let j in verses[i].lines){
                    for(let k in verses[i].lines[j].timings){
                        verses[i].lines[j].timings[k].currentBPM = getBPM(verses[i].lines[j].timings[k].start);
                        verses[i].lines[j].timings[k].start = convf(verses[i].lines[j].timings[k].start);
                        verses[i].lines[j].timings[k].end = convf(verses[i].lines[j].timings[k].end);
                        if(verses[i].lines[j].timings[k].splitTimes){
                            verses[i].lines[j].timings[k].splitTimes = verses[i].lines[j].timings[k].splitTimes.map(a => {
                                return convf(a);
                            });
                        }
                    }
                }
            }
            //console.log('progress D');
        }

        var lastEndTime = 0;
        var verseRanges = [];
        var first = true;
        for(var verse of verses){
            let startCount = 4;
            let startTime = verse.lines[0].timings[0].start;
            let ganjuDuration = verse.lines[0].timings[0].start-lastEndTime;
            let verseRange = [0,0];
            let firstRender = startTime;
            let beat;
            
            beat = 60000/verse.startBPM;

            let bbb = {
                n3:first ? 16 : 10,
                n2:first ? 12 : 7,
                n1:first ? 8 : 4,
                n0:first ? 4 : 1
            };
            if(ganjuDuration <= beat*bbb.n3) startCount = 3;
            if(ganjuDuration <= beat*bbb.n2) startCount = 2;
            if(ganjuDuration <= beat*bbb.n1) startCount = 1;
            if(ganjuDuration <= beat*bbb.n0) startCount = 0;

            let bottom = verse.lines.length < 2;
            startCount = Math.round(Math.max(0,Math.min(verse.count,4))) || startCount;
            for(var i = 1;i <= startCount;i++){
                events.add(startTime-(beat*i),'countdown',{ val:i < 0 || i > 4 ? null : i,lineCode:bottom ? LINE_2 : LINE_1 });
                firstRender = Math.min(firstRender,startTime-(beat*i));
            }

            for(var i = 1;i <= Math.max(0,4-startCount);i++){
                events.add(firstRender-i*10,'countdown',{ val:i < startCount || i-startCount > 4 ? null : i-startCount,lineCode:bottom ? LINE_2 : LINE_1 });
            }
            events.add(startTime,'countdown',{ val:null,lineCode:bottom ? LINE_2 : LINE_1 });
            
            let tpb = classifiedHeaders['ticks-per-beat'];
            let initialMinus = 200;
            let minus = initialMinus;
            if(ganjuDuration > 25000 && first) minus = Math.min(6000,ganjuDuration/2);
            if(verse.waitTime){
                minus = Math.max(
                    verse.waitTime-(verse.lines[0].timings[0].start-firstRender)
                    ,initialMinus);
            }
            firstRender = Math.max(firstRender-minus,0);
            verseRange[0] = firstRender-10;
            
            if(verse.lines.length < 2){
                verse.lines[0].lineCode = LINE_2;
                events.add(firstRender,'renderlyrics',verse.lines[0]);
                verseRange[1] = (verse.lines[0].timings[verse.lines[0].timings.length-1].end+verse.onEndHideDelay)+10;
                events.add(lastEndTime = verse.lines[0].timings[verse.lines[0].timings.length-1].end+verse.onEndHideDelay,'hidelyrics',{});
            }else{
                verse.lines[0].lineCode = LINE_1;
                verse.lines[1].lineCode = LINE_2;
                events.add(firstRender,'renderlyrics',verse.lines[0]);
                events.add(firstRender,'renderlyrics',verse.lines[1]);
                if(verse.lines[1].legacy.forceStartCount){
                    let beat2 = 60000/verse.lines[1].timings[0].currentBPM;
                    let startTime = verse.lines[1].timings[0].start;
                    for(let i = 0;i < 5;i++){
                        events.add(startTime-(beat2*i),'countdown',{ val:i || null,lineCode:LINE_2 });
                    }
                }
                let lines = [...verse.lines];

                let lineCode = true; // true:a,false:b
                for(var i in lines){
                    if(i < 2) continue;
                    if(!lines[i-1].timings.length) continue;
                    let renderTime = Math.max(
                        lines[i-1].timings[0].start+(lines[i-1].timings[0].end-lines[i-1].timings[0].start)/2,
                        lines[i-2].timings[lines[i-2].timings.length-1].end
                    );
                    lines[i].lineCode = lineCode ? LINE_1 : LINE_2;
                    events.add(renderTime,'renderlyrics',lines[i]);
                    if(verse.lines[i].legacy.forceStartCount){
                        let beat2 = 60000/verse.lines[i].timings[0].currentBPM;
                        let startTime = verse.lines[i].timings[0].start;
                        for(let i = 0;i < 5;i++){
                            events.add(startTime-(beat2*i),'countdown',{ val:i || null,lineCode:lines[i].lineCode });
                        }
                    }
                    lineCode = !lineCode;
                }
                let endTime = lastEndTime = [...([...verse.lines].reverse()[0]).timings].reverse()[0].end+verse.onEndHideDelay;
                events.add(endTime,'hidelyrics',{});
                verseRange[1] = endTime;
            }
            verseRanges.push(verseRange);
            first = false;
        }
        
        events.add(verseRanges[verseRanges.length-1][1]+150,'showinfo',{});
        events.add(verseRanges[verseRanges.length-1][1]+150+7500,'cleangui',{});

        let keys = Object.keys(events.getAll());
        let firsteventtime = Math.min(...keys);
        firsteventtime = Math.max(firsteventtime-1500,0);
        //if(convertedResult.headers.useMsec){
        /*}else{
            // useMsec이 항상 true로 나오므로 if문이 의미가 없어짐
            firsteventtime = Math.max(firsteventtime-(classifiedHeaders.meta['ticks-per-beat']*1.75),0);
        }*/

        // 재생후 firsteventtime에 도달하지 않아도 10초가 되면 cleangui 실행
        // 참고로 cleangui는 제목 숨기기 이벤트
        events.add(Math.min(10000,firsteventtime),'cleangui',{},true);
        events.add(0,'hidelyrics',{},true);

        if(classifiedHeaders.media == 'yjk-mv' || classifiedHeaders.media == 'midi-mv' || classifiedHeaders.media == 'audio-mv'){
            let time = classifiedHeaders['mv-timing'] || 0;
            events.add(time,'playmv',{},true);
        }

        return {
            headers:classifiedHeaders,
            rawHeaders:headers,
            events:events.getAll(),
            verseRanges,lyricLines,
            debug:{
                verses:verses,commands,bpmlist,bpmevents
            }
        };
    }
}