const Commands = require('./Commands');
const Parser = require('./Parser');
const {
    LineSeparate,VerseSeparate,
    SetLineProperty,SetVerseProperty,
    TimingEvent
} = require('./util_classes');

const STAKATO_MS = 10;
const STAKATO_TICK = 1;

module.exports = class CommandConverter{
    // 기존 방식(mr반주 기본값). tick 단위를 밀리초로 변환
    // tick 단위와 밀리초 단위를 같이 쓸수 있지만 bpm 수동지정 필수(기본bpm 120)
    static parseCommandWithStdDuration(commands,headers){
        var bpm = 120;
        var stringEvents = [];
        var ticksPerBeat = headers.meta['ticks-per-beat'];
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
                            stringEvents.push(new SetVerseProperty('waitTime',Parser.parseStdDuration(args[0],bpm,ticksPerBeat).reduce((a,b) => a+b.ms,0)));
                        }break;
                        case 'count':{
                            stringEvents.push(new SetVerseProperty('count',parseInt(args[0],10)));
                        }break;
                        case 'delay':{
                            playtime += Parser.parseStdDuration(args[0],bpm,ticksPerBeat).reduce((a,b) => a+b.ms,0);
                        }break;
                        case 'delay_ms':{
                            playtime += Parser.parseNumber(args[0]);
                        }break;
                    }
                }break;
                case 'd':{
                    playtime += Parser.parseStdDuration(cmd.delay,bpm,ticksPerBeat).reduce((a,b) => a+b.ms,0);
                }break;
                case 't':{
                    cmd.timings.forEach(time => {
                        let start = playtime;
                        let parsed = Parser.parseStdDuration(time,bpm,ticksPerBeat);
                        let splitTimes = [];
                        let splitRatio = [];
                        parsed.forEach(a => {
                            splitTimes.push(playtime += a.ms);
                            splitRatio.push(a.ratio);
                        });
                        splitTimes.pop();
                        //playtime += parsed.ms;
                        let end = parsed[parsed.length-1].stakato ? (splitTimes[splitTimes.length-1] || start)+STAKATO_MS : playtime;
                        stringEvents.push(new TimingEvent(Math.round(start),Math.round(end),bpm,splitTimes,splitRatio));
                    });
                }break;
                case 'l':{
                    if(cmd.end){
                        let endTime = parseFloat(cmd.endTime) ? cmd.endTime : 0;
                        stringEvents.push(new VerseSeparate((typeof cmd.endTime != 'undefined')
                        ? Parser.parseStdDuration(endTime,bpm,ticksPerBeat).reduce((a,b) => a+b.ms,0) : 0));
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

    // 새로운 방식(midi계열 반주 기본값). mr이면 밀리초,midi면 틱을 사용
    // 틱과 밀리초를 같이 사용 불가
    // 근데 ticks per beat는 가사파일과 미디파일에서 다를수 있음. 플레이시 알아서 계산해야됨
    static parseCommandWithPlaytimeDuration(commands,headers){
        var stringEvents = [];
        var playtime = 0;
        for(var cmd of commands){
            switch(cmd.type.toLowerCase()){
                case 'c':{
                    let { name,opts } = Commands.parse(cmd.cmd);
                    let { _unknown:args } = opts;
                    switch(name.toLowerCase()){
                        case 'show':{
                            stringEvents.push(new SetVerseProperty('waitTime',Parser.parsePlaytimeDuration(args[0]).reduce((a,b) => a+b.time,0)));
                        }break;
                        case 'count':{
                            stringEvents.push(new SetVerseProperty('count',parseInt(args[0],10)));
                        }break;
                        case 'delay':{
                            playtime += Parser.parsePlaytimeDuration(args[0]).reduce((a,b) => a+b.time,0);
                        }break;
                    }
                }break;
                case 'd':{
                    playtime += Parser.parsePlaytimeDuration(cmd.delay).reduce((a,b) => a+b.time,0);
                }break;
                case 't':{
                    cmd.timings.forEach(time => {
                        let start = playtime;
                        let parsed = Parser.parsePlaytimeDuration(time);
                        let splitTimes = [];
                        let splitRatio = [];
                        parsed.forEach(a => {
                            splitTimes.push(playtime += a.time);
                            splitRatio.push(a.ratio);
                        });
                        splitTimes.pop();
                        //playtime += parsed.ms;
                        let end = parsed[parsed.length-1].stakato ? (splitTimes[splitTimes.length-1] || start)+STAKATO_TICK : playtime;
                        stringEvents.push(new TimingEvent(Math.round(start),Math.round(end),0,splitTimes,splitRatio));
                    });
                }break;
                case 'l':{
                    if(cmd.end){
                        let endTime = parseFloat(cmd.endTime) ? cmd.endTime : 0;
                        stringEvents.push(new VerseSeparate((typeof cmd.endTime != 'undefined')
                        ? Parser.parsePlaytimeDuration(endTime).reduce((a,b) => a+b.time,0) : 0));
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
}