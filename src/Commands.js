const parse_command = require('command-line-args');

var opts = {};

/*
 * bpm 설정
*/
opts['bpm'] = [];

/*
 * duration: 해당 절의 가사가 시작하기 얼마나 전에 가사를 표시할지 설정
 * timing: 해당 절의 가사를 언제 표시할지 설정
*/
opts['show'] = [];

/*
 * 몇부터 카운트할지 설정. 최대값은 4
*/
opts['count'] = [];

/*
 * 틱단위로 delay를 넣음
*/
opts['delay'] = [];

/*
 * delay와 같으나 밀리초단위
*/
opts['delay_ms'] = [];

module.exports = class Commands{
    static parse(cmd_str){
        // 명령어 이름을 없애고 파싱
        return {
            name:cmd_str.split(/ +/g)[0],
            opts:parse_command(opts[cmd_str.split(/ +/g)[0].toLowerCase()] || [],{
                argv:cmd_str.split(/ +/g).slice(1),
                partial:true
            })
        };
    }
}