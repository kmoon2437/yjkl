const { Duration,ChangeBPM } = require('./util_classes');

const ALPHABETS = require('./alphabets'); // 영어,라틴문자,키릴문자,그리스문자 등등등
const WIDTH_CONVERT_TABLE = require('./width_convert');
const STRING_PLACEHOLDER = '\uf8ff';
const STRABLE_CHARS = ["'",'"'];
const BODY_BLOCK = { '[':']' };
const RUBY_BLOCK = { '{':'}','<':'>' };
const FORCE_SPLIT = '/';
const CONNECT_SYLLABLES = '.';
const SPLIT_ALPHABET = '_';
const ESCAPE = '\\';
const SPACE_REGEX = /[\u0020\u00a0\u3000]+/g; // \u0020(일반 띄어쓰기)와 \u00a0(nbsp), \u3000(전각 띄어쓰기)를 모두 인식
const SPECIAL_CHARS = [FORCE_SPLIT,CONNECT_SYLLABLES,SPLIT_ALPHABET];
const SPECIAL_CHARS2 = [CONNECT_SYLLABLES,SPLIT_ALPHABET];
const SPECIAL_CHARS3 = [...Object.keys(BODY_BLOCK),'('];
const SPECIAL_CHARS4 = [...Object.values(BODY_BLOCK),')'];

function removeComments(str){
    var strings = [];

    str = str.replace(/"(?:[^"\n\\]*|\\[\S\s])*"|'(?:[^'\n\\]*|\\[\S\s])*'/g,(matched) => {
        strings.push(matched); return STRING_PLACEHOLDER;
    });
    str = str.replace(/\/\/.*/g,'').replace(/\/\*[^*]*\*+(?:[^*\/][^*]*\*+)*\//g,'');
    str = str.replace(new RegExp(STRING_PLACEHOLDER,'g'),() => {
        return strings.shift();
    });

    return str.trim();
}

function strReverse(str){
    return str.split('').reverse().join('');
}

function strContains(str,a){
    return str != strReplaceAll(str,a,'');
}

function strReplaceAll(str,a,b){
    if(a instanceof Array && !(b instanceof Array)){
        for(let s of a){
            str = strReplaceAll(str,s,b);
        }
    }else if(b instanceof Array && !(a instanceof Array)){
        for(let s of b){
            str = strReplaceAll(str,a,s);
        }
    }else if(a instanceof Array && b instanceof Array){
        let cnt = Math.max(a.length,b.length);
        for(let i = 0;i < cnt;i++){
            str = strReplaceAll(str,a[Math.min(i,a.length-1)],b[Math.min(i,b.length-1)]);
        }
    }else{
        while(str.indexOf(a) > -1){
            str = str.replace(a,b);
        }
    }
    return str;
}

class Syllable{
    constructor(s,alphabet = false){
        this.s = s;
        this.alphabet = alphabet;
    }
}

module.exports = class Parser{
    static ALPHABET_REGEX = /(['a-zA-Z])/;

    static parse(data){
        // 버퍼일수도 있으니 문자열로 변환
        data = data.toString();
        
        // 주석 제거
        data = removeComments(data.replace(/\r\n/g,'\n').replace(/\r/g,'\n'));
        
        // header와 content로 분리
        data = data.trim().split(/\n\n+/g);
        var { header,content } = { header:data[0],content:data[1] };
        {
            let arr = [...data];
            arr.shift();
            for(var i in arr){
                arr[i] = arr[i].trim();
            }
            content = arr.join('\n').trim();
        }
        
        // header는 대소문자를 무시한다.
        var headers = {};
        header = header.trim().split('\n');
        for(var h of header){
            var hh = h.split(':');
            var key = hh[0];
            hh.shift();
            var val = hh.join(':');
            let str = val.trim();
            let strFirst = str.split('')[0];
            let strLast = str.split('').reverse()[0];
            for(let c of STRABLE_CHARS){
                if(strFirst == c && strLast == c){
                    str = str.split('');
                    str.pop();
                    str.shift();
                    str = str.join('');
                    break;
                }
            }
            headers[key.toLowerCase()] = str.trim();
        }
        
        var commands = [];
        content = content.trim().split('\n');
        for(var c of content){
            var cc = c.split(SPACE_REGEX);
            
            var type = cc.shift().toLowerCase();
            var cmd = {};
            cmd.type = type;
            switch(type){
                case 'c':
                    cmd.cmd = c.replace(/c( +)/i,'').trim();
                break;
                case 't':
                    cmd.timings = cc;
                break;
                case 'l':
                    cmd.end = cc[0] ? true : false;
                    cmd.endTime = cc[0];
                break;
                case 's':
                    cmd.sentence = cc.join(' ');
                break;
                case 'u':
                    cmd.sentence = cc.join(' ');
                break;
                case 'p':
                    cmd.typecode = Parser.parseNumber(cc[0]);
                break;
            }
            commands.push(cmd);
        }
        
        return { headers,commands };
    }

    static isRuby(sentence){
        let a = Parser.parseRubySyntax(sentence);
        return !!a.map(e => e[1]).join('');
    }
    
    // 슬래시(/) 없이 사용하는 경우
    static splitSentence(parsed){
        let str = '';
        let alphabet = true;
        let isEscape = false;
        let connect = false;
        let result = [];
        for(let i in parsed){
            let txt = parsed[i];
            if(typeof txt != 'string'){
                if(str){
                    result.push(str);
                    str = '';
                    txt.connectBefore = true;
                }
                result.push(txt);
                continue;
            }
            
            for(let j in txt){
                // 현재 문자와 이전 문자 결정
                let chr = txt[j];
                let nchr = txt[j-(-1)];
                if(j == txt.length-1){
                    if(typeof parsed[i-(-1)] == 'string'){
                        nchr = parsed[i-(-1)].charAt(0);
                    }else{
                        // 2연속으로 객체가 나올 일은 없음
                        nchr = parsed[i-(-2)] ? parsed[i-(-2)].charAt(0) : '';
                    }
                }
                
                if(isEscape){
                    isEscape = false;
                    str += chr;
                }else if(chr == ESCAPE){
                    isEscape = true;
                }else if(chr == CONNECT_SYLLABLES){
                    connect = true;
                }else if(chr.match(SPACE_REGEX)){
                    if(str) result.push(str);
                    result.push(chr);
                    str = '';
                //}else if(chr.match(this.ALPHABET_REGEX)){
                }else if(ALPHABETS.indexOf(chr) >= 0){
                    alphabet = true;
                    str += chr;
                }else if(chr == SPLIT_ALPHABET && alphabet){
                    result.push(str); str = '';
                }else if(chr == '('){
                    //if(alphabet || nchr.match(this.ALPHABET_REGEX)) str += chr;
                    if(alphabet || ALPHABETS.indexOf(nchr) >= 0) str += chr;
                    else result.push(chr);
                }else if(chr == ')'){
                    if(alphabet) str += chr;
                    else result[result.length-1] += chr;
                }else{
                    alphabet = false;
                    if(result[result.length-1] && result[result.length-1].connectBefore){
                        result[result.length-1].connectBefore = false;
                    }
                    if(str){
                        result.push(str);
                        str = '';
                    }
                    if(SPECIAL_CHARS3.indexOf(result[result.length-1]) >= 0 || connect) result[result.length-1] += chr;
                    else result.push(chr);
                    connect = false;
                }
            }
        }
        if(str) result.push(str);
        
        let connectAfter = true;
        return result.reduce((a,b,i) => {
            if(typeof b != 'string'){
                if(b.connectBefore) a[a.length-1].push(b);
                else a.push([b]);
                connectAfter = true;
                delete b.connectBefore;
            }else{
                if(connectAfter) a[a.length-1].push(b);
                else a.push([b]);
                connectAfter = false;
            }
            return a;
        },[[]]).filter(a => a.length);
    }
    
    static splitSentenceBySlash(parsed){
        let result = [];
        let str = [];
        for(let i in parsed){
            let txt = parsed[i];
            if(typeof txt != 'string'){
                if(str){
                    result.push(str);
                    str = '';
                    txt.connectBefore = true;
                }
                result.push(txt);
                continue;
            }
            
            for(let j in txt){
                let chr = txt[j];
                if(chr == FORCE_SPLIT){
                    result.push(str);
                    str = '';
                }else if(chr.match(SPACE_REGEX)){
                    result.push(str,chr);
                    str = '';
                }else{
                    str += chr;
                }
            }
        }
        if(str) result.push(str);
        
        let connectAfter = true;
        return result.filter(a => a).reduce((a,b,i) => {
            if(typeof b != 'string'){
                if(b.connectBefore) a[a.length-1].push(b);
                else a.push([b]);
                connectAfter = true;
                delete b.connectBefore;
            }else{
                if(connectAfter) a[a.length-1].push(b);
                else a.push([b]);
                connectAfter = false;
            }
            return a;
        },[[]]).filter(a => a.length).map(a => a.filter(s => !(s instanceof Array)));
    }

    static parseSentence(sentence){
        sentence = sentence.replace(SPACE_REGEX,' '); // 띄어쓰기가 여러개 있던걸 한개로 변환
        let parsed = Parser.parseRubySyntax(sentence);
        let syllables;
        if(sentence.match(FORCE_SPLIT)){
            syllables = Parser.splitSentenceBySlash(parsed);
        }else{
            syllables = Parser.splitSentence(parsed);
        }
        
        // 전각<->반각 간 변환
        syllables = syllables.map(a => { return a;
            for(let i in WIDTH_CONVERT_TABLE){
                return strReplaceAll(a,i,WIDTH_CONVERT_TABLE[i]);
            }
        });
    
        return syllables; // 잘린 거
    }

    static #parseMathExpression(num){
        let expression = [''];
        for(let chr of num){
            // 공백
            if(!chr.trim()) break;
    
            if(chr.match(/[0-9.]/)){ // 숫자
                if(!expression[expression.length-1]) expression[expression.length-1] = '';
                expression[expression.length-1] += chr;
            }else if(chr.match(/[\+\-\*\/]/)){ // (사칙)연산자
                expression.push({ operator:chr },'');
            }else{
                throw new SyntaxError('Unexpected operator');
            }
        }
        //console.log(expression);
        let result = 0;
        let operator = '+';
        for(let n of expression){
            if(n.operator){
                if(operator) throw new SyntaxError('Unexpected operator2');
                operator = n.operator;
            }else{
                if(operator == '+'){
                    result += parseFloat(n);
                }else if(operator == '-'){
                    result -= n;
                }else if(operator == '*'){
                    result *= n;
                }else if(operator == '/'){
                    result /= n;
                }
                operator = '';
            }
        }
        return result;
    }

    static parseNumber(num){
        if(typeof num == 'number') return num;
        else if(typeof num == 'string'){
            if(isNaN(Number(num))) return Parser.#parseMathExpression(num);
            else return Number(num);
        }else return 0;
    }

    static parseTiming(time){
        time = time.split(':');
        let timing = {};
        timing.start = Parser.parseNumber(time[0]);
        if(time[1]) timing.end = Parser.parseNumber(time[1]);
        else timing.end = null;

        return timing;
    }
    
    // 최대공약수(the "g"reatest "c"ommon "d"enominator)
    // 두 수의 최대공약수 계산
    static #doCalcGCD(num1,num2){
        while(num2 != 0){
            let tmp = num1 % num2;
            num1 = num2;
            num2 = tmp;
        }
        return Math.abs(num1);
    }
    
    // 여러 수의 최대공약수를 계산
    static #calcGCD(arr){
        let gcd = Parser.#doCalcGCD(arr.shift(),arr.shift());
        while(arr.length){
            gcd = Parser.#doCalcGCD(gcd,arr.shift());
        }
        return gcd;
    }
    
    static #doParseDuration(time,bpm = 120,ticksPerBeat = 120){
        /*if(time.startsWith('#')){
            return new ChangeBPM(this.parseNumber(time.slice(1)));
        }*/

        let [ ttt,ms ] = time.split(':');
        let [ ratio,tick ] = ttt.split('@').length > 1 ? ttt.split('@') : [1,ttt];

        let stakato = time.startsWith('*');
        let ratioo = parseInt(ratio,10);
        if(stakato){
            let tick2 = tick.split('');
            tick2.shift();
            tick = tick2.join('');
        }
        let beat = parseFloat(Parser.parseNumber(tick))/ticksPerBeat;
        let msec = 60000/bpm*beat;
        if(ms) msec += parseFloat(Parser.parseNumber(ms));
        return new Duration(msec,ratioo,stakato);
    }

    // 틱:밀리초
    // ,를 사용해 여러개 붙일 수 있음
    // (즉 한글자를 여러번 나눠서 색칠 가능)
    // 비율@틱:밀리초 형태로 쓸 수 있음
    // 비율은 생략 가능,생략시 기본값은 1
    // - 예시: 19:72,*3@11:21 => 1:3 비율로 색칠
    // &로 2개의 duration을 더할 수 있음(추후 구현 예정)
    // - (숫자)+(숫자)와의 차이점은 중간에 bpm변경이 가능(#숫자)
    // -- 예시: 1972&#170&1121
    // - 우선순위는 ,이 &보다 높음
    static parseDuration(time,bpm = 120,ticksPerBeat = 120){
        if(typeof time == 'number'){
            return [new Duration(
                60000/bpm*(parseFloat(Parser.parseNumber(time))/ticksPerBeat),
                1,false
            )];
        }else if(typeof time == 'string'){
            let split = time.split(',');
            let parsed = split.map(a => Parser.#doParseDuration(a,bpm,ticksPerBeat));
            if(split.length > 1){
                let gcd = Parser.#calcGCD(parsed.map(a => a.ratio));
                for(let i in parsed){
                    parsed[i].ratio /= gcd;
                }
            }
            return parsed;
        }else return [new Duration(0,1,false)];
    }

    static stringifyRubySyntax(blocks){
        let lineStr = '';
        for(let el of blocks){
            if(el[1]) lineStr += `[${el[0]}]<${el[1]}>`;
            else lineStr += el[0];
        }

        return lineStr;
    }

    static parseRubySyntax(text){
        //this.status = [];
        let blocks = [''];
        let status = {
            body:'',
            ruby:'',
            bodyBlockClosed:false
        };
        let data = {
            body:'',
            ruby:''
        };
        for(let i in text){
            let chr = text[i];
            if(BODY_BLOCK[chr]){
                if(status.body) throw new SyntaxError(`Already opened the body block at position ${i} (character: '${chr}')`);
                if(status.ruby) throw new SyntaxError(`Already opened the ruby block at position ${i} (character: '${chr}')`);
                status.body = chr;
                //blocks.push([data.body,data.ruby]);
                blocks.push({ ruby:data.ruby,length:strReplaceAll(data.body,SPECIAL_CHARS,'').length },data.body);
                data.body = '';
                data.ruby = '';
            }else if(chr == BODY_BLOCK[status.body]){
                status.body = '';
                status.bodyBlockClosed = true;
            }else if(RUBY_BLOCK[chr]){
                if(status.ruby) throw new SyntaxError(`Already opened the ruby block at position ${i} (character: '${chr}')`);
                if(status.body) throw new SyntaxError(`Already opened the body block at position ${i} (character: '${chr}')`);
                if(i == 0) throw new SyntaxError(`Invalid syntax at position ${i} (character: '${chr}')`);
                if(!status.bodyBlockClosed){
                    let str = data.body.slice(0,data.body.length-1);
                    data.body = data.body[data.body.length-1];
                    //blocks.push([str,'']);
                    blocks[blocks.length-1] += str;
                }
                status.bodyBlockClosed = false;
                status.ruby = chr;
            }else if(status.bodyBlockClosed){
                throw new SyntaxError(`Invalid syntax at position ${i} (character: '${chr}')`);
            }else if(chr == RUBY_BLOCK[status.ruby]){
                status.ruby = '';
                //blocks.push([data.body,data.ruby]);
                blocks.push({ ruby:data.ruby,length:strReplaceAll(data.body,SPECIAL_CHARS,'').length },data.body);
                data.body = '';
                data.ruby = '';
            }else{
                if(status.ruby){
                    data.ruby += chr;
                }else{
                    data.body += chr;
                }
            }
            //this.status.push({ chr,status:{...status},data:{...data} });
        }
        if(data.body){
            //blocks.puash([data.body,data.ruby]);
            if(data.ruby) blocks.push({ ruby:data.ruby,length:strReplaceAll(data.body,SPECIAL_CHARS,'').length },data.body);
            else blocks[blocks.length-1] += data.body;
        }

        return blocks.reduce((a,b) => {
            if(typeof b == 'string' && typeof a[a.length-1] == 'string') a[a.length-1] += b;
            else a.push(b);
            return a;
        },[]).filter(a => typeof a == 'string' ? a : a.ruby);
    }
}