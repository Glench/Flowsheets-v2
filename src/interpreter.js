// @flow
const spawn = require('child_process').spawn;
const filbert = require('filbert');
const _ = require('underscore');

// @Cleanup: probably move to utils at some point
function assert(condition: boolean) {
    if (!condition) {
        throw 'Assertion failed!'
    }
}

const ui = require('./renderer.js');


if (__dirname.endsWith('build')) {
    var python_interpreter = spawn('python', [__dirname+'/interpreter.py']);
    python_interpreter.on('close', function(data) {
        alert("Python processes closed! Try to restart? Error code: "+data)
    })
    module.exports.python_interpreter = python_interpreter;
} else {
    throw "Can't find interpreter.py, __dirname is: "+__dirname;
}


function get_user_identifiers(python_expression: string):string[] {
    var advance_token = filbert.tokenize(python_expression)
    var token = advance_token();
    var names = {};
    while (token.type.type !== 'eof') {
        if (token.type.type === 'name') {
            names[token.value] = true;
        }
        token = advance_token();
    }
    // remove all references to built-ins
    return _.keys(names).filter(key => {
        return !_.has(filbert.pythonRuntime, key) &&
               !_.has(filbert.pythonRuntime.functions, key) &&
               !_.has(filbert.pythonRuntime.ops, key);
    });
}

function get_user_identifiers_with_positions(python_expression: string):Object[] {
    var advance_token = filbert.tokenize(python_expression, {locations: true})
    var token = advance_token();
    var names_and_positions = [];
    while (token.type.type !== 'eof') {
        if (token.type.type === 'name') {
            var location = {
                name:       token.value,
                start_line: token.startLoc.line-1, // 1-based index for some reason
                start_ch:   token.startLoc.column,
                end_line:   token.endLoc.line-1, // 1-based index for some reason
                end_ch:     token.endLoc.column,
            }
            names_and_positions.push(location);
        }
        token = advance_token();
    }
    // remove all references to built-ins
    return names_and_positions.filter(location => {
        var key = location.name;
        var current_names = blocks.map(block => block.name)
        return !_.has(filbert.pythonRuntime, key) &&
               !_.has(filbert.pythonRuntime.functions, key) &&
               !_.has(filbert.pythonRuntime.ops, key) &&
               (_.contains(current_names, key) || _.contains(current_names, key.slice(0, key.length-1)));
               // remove tail _ from name
    });
}
module.exports.get_user_identifiers_with_positions = get_user_identifiers_with_positions;

function replace_python_names(old_code: string, to_replace: string, replace_with: string): string {
    // replace `to_replace` with `replace_with` in `old_code`

    // 'a+1' => ['b','+1']
    // '1+a+1' => ['1+', 'b', '+1']
    // 'a_+1' => ['b_','+1']
    var advance_token = filbert.tokenize(old_code)
    var new_code = [''];
    var token = advance_token();
    while (token.type.type !== 'eof') {
        if (token.value === to_replace) {
            new_code.push(replace_with)
            new_code.push('')
        } else if (token.value === (to_replace+'_')) {
            new_code.push(replace_with+'_')
            new_code.push('')
        } else {
            if (!token.value) {
                if (token.type.type === 'newline') {
                    // e.g. token = {value: undefined, type: {type: 'newline'}}
                    token.value = '\n'
                } else {
                    // e.g. token = {value: undefined, type: {type: '['}}
                    token.value = token.type.type;
                }
            } else if (token.type.type === 'string') {
                // e.g. token = {value: 'hi there', type: {type: 'string'}}, it removes the quotes from string literals...
                token.value = `${old_code[token.start]}${token.value}${old_code[token.end-1]}`;
            } else if (token.value === 'return' && token.type.keyword === 'return') {
                // e.g. token = {value: 'return', type: {keyword: 'return'}}
                token.value = 'return ' // needs to have space on the end
            }

            new_code[new_code.length-1] += token.value;
        }
        token = advance_token();
    }
    return new_code.join('');
}

// get stdout character-by-character until newline
var stdout_accumulation: string[] = [];
python_interpreter.stdout.setEncoding('utf8')
python_interpreter.stdout.on('readable', () => {

    var character = python_interpreter.stdout.read(1);

    // pipe.read(1) returns null when nothing to read
    while (character) {
        character = character.toString();
        if (character === '\n') {

            // run callbacks
            if (fail_queue.length && success_queue.length) {
                var success_func: Function = success_queue.shift();
                fail_queue.shift();
                success_func(stdout_accumulation.join(''))
            }

            stdout_accumulation = [];
            character = python_interpreter.stdout.read(1);
            continue
        }

        stdout_accumulation.push(character); // @Speed? This is probably hella slow. Is .join() faster?
        character = python_interpreter.stdout.read(1);
    }
});


var stderr_accumulation: string[] = [];
python_interpreter.stderr.setEncoding('utf8')
python_interpreter.stderr.on('readable', () => {

    var character = python_interpreter.stderr.read(1);

    while (character) {
        character = character.toString();

        if (character === '\n') {

            // run callbacks
            if (fail_queue.length && success_queue.length) {
                var fail_func: Function = fail_queue.shift();
                success_queue.shift();
                fail_func(stderr_accumulation.join(''))
            }

            stderr_accumulation = [];
            character = python_interpreter.stderr.read(1);
            continue
        }

        stderr_accumulation.push(character); // @Speed? This is probably hella slow. Is .join() faster?
        character = python_interpreter.stderr.read(1);
    }
});

function python_exec(python_code: string) {
    assert(success_queue.length !== 0 && fail_queue.length !== 0); // should never have something on the queue without a success and error handler
    python_interpreter.stdin.write(`__EXEC:${python_code.replace(/\n/g, '__NEWLINE__')}\n`);
};


var blocks: Block[] = [];
module.exports.blocks = blocks;

function generate_unique_name():string {
    // 'a', 'b', 'c', ...
    var existing_names = blocks.map(block => block.name);
    var alpha_index = 'a';
    var current_test_name = alpha_index;
    while (existing_names.indexOf(current_test_name) >= 0) {
        alpha_index = String.fromCharCode(alpha_index.charCodeAt(0) + 1);
        current_test_name = alpha_index;
    }
    return current_test_name;

}
function generate_unique_name_from_name(test_name:string):string {
    // 'usernames' => 'usernames_1' => 'usernames_2'
    var existing_names = blocks.map(block => block.name);
    var number_index = 0;
    var current_test_name = test_name.replace(/\s/g, '_');
    if (_.has(filbert.pythonRuntime, current_test_name) || 
        _.has(filbert.pythonRuntime.functions, current_test_name) || 
        _.has(filbert.pythonRuntime.ops, current_test_name)) {

        // e.g. someone tries to name something 'sum' or 'json'
        current_test_name = '_'+current_test_name;
    }
    while (existing_names.indexOf(current_test_name) >= 0) {
        number_index += 1;
        current_test_name = test_name + '_' + number_index;
    }
    return current_test_name;
}


// Basically, queue up commands to run on the python processes's stdin,
// and queue up what to do if a command succeeds or fails as well. If
// it succeeds, then the fail function is thrown away. If it fails,
// then the succeed function is thrown away.
var success_queue: Function[] = [];
var fail_queue: Function[] = [];


type JSONType = | string | number | boolean | null | JSONObject | JSONArray;
type JSONObject = { [key:string]: JSONType };
type JSONArray = Array<JSONType>;

class Block {
    name: string;
    depends_on: Block[];
    code: string;
    filter_clause: ?string;
    is_string_concat: boolean;
    output: any; //JSONType;
    error: ?string;

    constructor() {
        this.depends_on = [];
        this.is_string_concat = false;
    }

    toString() {
        return `Block ${this.name}`;
    }
}
module.exports.Block = Block;

function create_block(name: ?string, code: string) {
    var block = new Block();
    if (name) {
        block.name = generate_unique_name_from_name(name)
    } else {
        block.name = generate_unique_name()
    }
    block.code = code;

    blocks.push(block);

    python_declare(block);

    update_blocks_because_this_one_changed(block);

    return block;
}
module.exports.create_block = create_block;

function python_import(python_code: string) {
    // e.g. 'import time'
    // e.g. 'from datetime import datetime'

    // @Cleanup: If an import box changes, should delete old names
    success_queue.push(function(data: string) {

    })
    fail_queue.push(function(data: string) {

    })
    python_exec(python_code)
}
module.exports.python_import = python_import;

function python_declare(block: Block) {
    var code = block.code;
    if (block.is_string_concat) {
        var token_re = /\$\{.+?\}/g // e.g. ${butts}
        var tokens = code.match(token_re)
        if (tokens && tokens.length) {
            tokens.forEach(token => code = code.replace(token, '{}'))
            var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
            code = `"""${code}""".format(${expressions.join(',')})`
        } else {
            code = `"""${code}"""`;
        }
    }

    // a_ means 'for a_ in a: ...'
    var map_variables = _.uniq(get_user_identifiers(code).filter(name => _.last(name) == '_'))

    var python_function_declaration: string;
    var python_function_name = `_${block.name}_function`;
    if (code.indexOf('return') > -1) {
        // function
        if (map_variables.length > 0) {
            // need arguments
            python_function_declaration = `def ${python_function_name}(${map_variables.join(', ')}):
  ${code.split('\n').join('\n  ')}`;
        } else {
            python_function_declaration = `def ${python_function_name}():
  ${code.split('\n').join('\n  ')}`;
        }
    } else if (map_variables.length > 0) {
        // lambda
        python_function_declaration = `${python_function_name} = lambda ${map_variables.join(', ')}: ${code}`;
    } else {
        // just an expression, don't declare anything
        return
    }

    console.log('declaring python:', python_function_declaration)
    var no_op = function() {};
    var success = function(data: string) {
        block.error = '';
        ui.render_error(block);
    }
    var fail = function(data: string) {
        success_queue[0] = no_op; // remove callback handling running this function
        success_queue[1] = no_op; // remove callback handling getting the result of this function
        fail_queue[0] = no_op; // remove callback handling running this function
        fail_queue[1] = no_op; // remove callback handling getting the result of this function

        block.error = data;

        ui.render_error(block);
    }

    success_queue.push(success);
    fail_queue.push(fail);
    python_exec(python_function_declaration);
}

function python_run(block: Block) {

    var code = block.code;
    if (block.is_string_concat) {
        var token_re = /\$\{.+?\}/g // e.g. ${butts}
        var tokens = code.match(token_re)
        if (tokens && tokens.length) {
            tokens.forEach(token => code = code.replace(token, '{}'))
            var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
            code = `"""${code}""".format(${expressions.join(',')})`
        } else {
            code = `"""${code}"""`;
        }
    }

    var python_code: string;

    // a_ means 'for a_ in a: ...'
    var map_variables = _.uniq(get_user_identifiers(code).filter(name => _.last(name) == '_'));
    if (map_variables.length > 0) {
        var zip_variables = map_variables.map(name => name.slice(0,name.length-1)) // 'a_' => 'a'
        // can't just use map(f, a,b,c) because python's map uses zip_longest behavior
        python_code = `${block.name} = list(starmap(_${block.name}_function, izip(${zip_variables.join(',')})))`
    } else if (code.indexOf('return') > -1) {
        python_code = `${block.name} = _${block.name}_function()`;
    } else {
        python_code = `${block.name} = ${code}`; 
    }

    console.log('running python:', python_code)
    var no_op = function() {};
    var success = function(data: string) {
        block.error = '';
        ui.render_error(block);
    }
    var fail = function(data: string) {
        success_queue[0] = no_op; // remove callback trying to get value of this function
        fail_queue[0] = no_op; // remove callback trying to get value of this function

        block.error = data;
        ui.render_error(block);
    };

    success_queue.push(success);
    fail_queue.push(fail);
    python_exec(python_code)
}

function get_python_value(block: Block) {
    // get the value of an expression
    success_queue.push(function(data: string) {
        try {
            // for some reason, eval-ing JSON object literals is a syntax error??
            eval(`block.output = ${data}`);
            block.error = '';
            ui.render_error(block)
        } catch(e) {
            throw `Error on evaluating. Data coming out of 'Block ${block.name}' is bad: ${data}`;
        }

        ui.render_output(block);
    });
    fail_queue.push(function(data: string) {
        block.error = `error in evaling Block ${block.name}! ${data}`;
        ui.render_error(block);
    });
    // console.log('getting python value:', block.name)
    python_interpreter.stdin.write(`__EVAL:stringify(${block.name})\n`)
}


function change_name(block: Block, name: string):string {
    var old_name = block.name;
    block.name = generate_unique_name_from_name(name);

    // Update references to this block in other blocks' code
    // Anything that depends on `block` should have its code updated
    blocks.forEach(test_block => {
        if (test_block.depends_on.includes(block)) {
            if (test_block.is_string_concat) {
                var token_re = /\$\{.+?\}/g; // e.g. ${butts}
                var tokens = test_block.code.match(token_re);
                if (tokens && tokens.length) {
                    var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
                    _.zip(tokens,expressions).forEach(function(tokenexpression) {
                        var token = tokenexpression[0];
                        var expression = tokenexpression[1];
                        var new_token = '${'+replace_python_names(expression, old_name, block.name)+'}';
                        test_block.code = test_block.code.replace(token, new_token)
                    })
                }

            } else {
                test_block.code = replace_python_names(test_block.code, old_name, block.name)
            }
            ui.render_code(test_block)
        }
    })

    var map_variables = _.uniq(get_user_identifiers(block.code).filter(name => _.last(name) === '_'))
    if (block.code.indexOf('return') > -1 || map_variables.length > 0) {
        var old_function_name = `_${old_name}_function`;
        var new_function_name = `_${block.name}_function`;
        var python_code = `${block.name} = ${old_name}; del ${old_name}; ${new_function_name} = ${old_function_name}; del ${old_function_name}`;
    } else {
        var python_code = `${block.name} = ${old_name}; del ${old_name}`;
    }

    var callback = () => {}; //console.log(`Block ${old_name} name changed to ${block.name}`)
    success_queue.push(callback);
    fail_queue.push(callback)
    python_exec(python_code)

    return block.name;
}
module.exports.change_name = change_name;

function change_code(block: Block, code: string) {
    block.code = code;

    var names: string[] = [];
    try {
        if (block.is_string_concat) {
            // @Cleanup @Refactor: move this logic to more central location
            var token_re = /\$\{.+?\}/g; // e.g. ${butts}
            var tokens = code.match(token_re);
            if (tokens && tokens.length) {
                var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
                expressions.forEach(expression => {
                    var new_names = get_user_identifiers(expression);
                    new_names.forEach(name => names.push(name))
                })
            }
        } else {
            names = get_user_identifiers(block.code);
        }
    } catch(e) {
        // syntax error in filbert parsing most likely
        block.error = e;
        ui.render_error(block);
        return
    }

    // @Cleanup: detect cyclical dependencies more formally, not just self reference
    if (_.contains(names, block.name) || _.contains(names, block.name+'_')) {
        block.error = "Can't refer to self with name \""+ block.name +"\"";
        ui.render_error(block);
        return
    }

    block.depends_on = blocks.filter(function(test_block: Block) {
        return names.includes(test_block.name) || names.includes(test_block.name+'_');
    });

    python_declare(block)

    update_blocks_because_this_one_changed(block);
}
module.exports.change_code = change_code;

function delete_(block_to_delete: Block) {
    throw 'Need to delete block from interpreter'
    // blocks = _.reject(blocks, block => block === block_to_delete);
    // blocks.forEach(function(block) {
    //     block.depends_on = _.reject(block.depends_on, 
    // })
}
module.exports.delete_ = delete_;

function update_blocks_because_this_one_changed(updatedBlock: Block):void {
    // if a block's value changes, update it and go update all the other blocks that depend on that block
    var updated_blocks: Block[] = [updatedBlock];
    while (updated_blocks.length) {
        var block = updated_blocks.shift(); // pop off front of array
        python_run(block);
        get_python_value(block); 
        blocks.forEach(function(should_update_block:Block) {
            if (should_update_block.depends_on.includes(block)) {
                updated_blocks.push(should_update_block)
            }
        }) 
    }
}
module.exports.update_blocks_because_this_one_changed = update_blocks_because_this_one_changed;
