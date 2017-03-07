const spawn = require('child_process').spawn;
const filbert = require('filbert');
const _ = require('underscore');

// @Cleanup: probably move to utils at some point
function assert(condition) {
    if (!condition) {
        throw 'Assertion failed!';
    }
}

const ui = require('./renderer.js');

if (__dirname.endsWith('build')) {
    var python_interpreter = spawn('python', [__dirname + '/interpreter.py']);
    python_interpreter.on('close', function (data) {
        alert("Python processes closed! Probably due to interpreter.py error. Error code: " + data);
    });
    module.exports.python_interpreter = python_interpreter;
} else {
    throw "Can't find interpreter.py, __dirname is: " + __dirname;
}

function get_user_identifiers(python_expression) {
    var advance_token = filbert.tokenize(python_expression);
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
        return !_.has(filbert.pythonRuntime, key) && !_.has(filbert.pythonRuntime.functions, key) && !_.has(filbert.pythonRuntime.ops, key);
    });
}

function get_user_identifiers_with_positions(python_expression) {
    var advance_token = filbert.tokenize(python_expression, { locations: true });
    var token = advance_token();
    var names_and_positions = [];
    while (token.type.type !== 'eof') {
        if (token.type.type === 'name') {
            var location = {
                name: token.value,
                start_line: token.startLoc.line - 1, // 1-based index for some reason
                start_ch: token.startLoc.column,
                end_line: token.endLoc.line - 1, // 1-based index for some reason
                end_ch: token.endLoc.column
            };
            names_and_positions.push(location);
        }
        token = advance_token();
    }
    // remove all references to built-ins
    return names_and_positions.filter(location => {
        var key = location.name;
        var current_names = blocks.map(block => block.name);
        return !_.has(filbert.pythonRuntime, key) && !_.has(filbert.pythonRuntime.functions, key) && !_.has(filbert.pythonRuntime.ops, key) && (_.contains(current_names, key) || _.contains(current_names, key.slice(0, key.length - 1)));
        // remove tail _ from name
    });
}
module.exports.get_user_identifiers_with_positions = get_user_identifiers_with_positions;

function replace_python_names(old_code, to_replace, replace_with) {
    // replace `to_replace` with `replace_with` in `old_code`

    // 'a+1' => ['b','+1']
    // '1+a+1' => ['1+', 'b', '+1']
    // 'a_+1' => ['b_','+1']
    var advance_token = filbert.tokenize(old_code);
    var new_code = [''];
    var token = advance_token();
    while (token.type.type !== 'eof') {
        if (token.value === to_replace) {
            new_code.push(replace_with);
            new_code.push('');
        } else if (token.value === to_replace + '_') {
            new_code.push(replace_with + '_');
            new_code.push('');
        } else {
            if (!token.value) {
                if (token.type.type === 'newline') {
                    // e.g. token = {value: undefined, type: {type: 'newline'}}
                    token.value = '\n';
                } else {
                    // e.g. token = {value: undefined, type: {type: '['}}
                    token.value = token.type.type;
                }
            } else if (token.type.type === 'string') {
                // e.g. token = {value: 'hi there', type: {type: 'string'}}, it removes the quotes from string literals...
                token.value = `${old_code[token.start]}${token.value}${old_code[token.end - 1]}`;
            } else if (token.value === 'return' && token.type.keyword === 'return') {
                // e.g. token = {value: 'return', type: {keyword: 'return'}}
                token.value = 'return '; // needs to have space on the end
            }

            new_code[new_code.length - 1] += token.value;
        }
        token = advance_token();
    }
    return new_code.join('');
}

// get stdout character-by-character until newline
var stdout_accumulation = [];
python_interpreter.stdout.setEncoding('utf8');
python_interpreter.stdout.on('readable', () => {

    var character = python_interpreter.stdout.read(1);

    // pipe.read(1) returns null when nothing to read
    while (character) {
        character = character.toString();
        if (character === '\n') {

            // run callbacks
            if (fail_queue.length && success_queue.length) {
                var success_func = success_queue.shift();
                fail_queue.shift();
                success_func(stdout_accumulation.join(''));
            }

            stdout_accumulation = [];
            character = python_interpreter.stdout.read(1);
            continue;
        }

        stdout_accumulation.push(character); // @Speed? This is probably hella slow. Is .join() faster?
        character = python_interpreter.stdout.read(1);
    }
});

var stderr_accumulation = [];
python_interpreter.stderr.setEncoding('utf8');
python_interpreter.stderr.on('readable', () => {

    var character = python_interpreter.stderr.read(1);

    while (character) {
        character = character.toString();

        if (character === '\n') {

            // run callbacks
            if (fail_queue.length && success_queue.length) {
                var fail_func = fail_queue.shift();
                success_queue.shift();
                fail_func(stderr_accumulation.join(''));
            }

            stderr_accumulation = [];
            character = python_interpreter.stderr.read(1);
            continue;
        }

        stderr_accumulation.push(character); // @Speed? This is probably hella slow. Is .join() faster?
        character = python_interpreter.stderr.read(1);
    }
});

function python_exec(python_code) {
    assert(success_queue.length !== 0 && fail_queue.length !== 0); // should never have something on the queue without a success and error handler
    python_interpreter.stdin.write(`__EXEC:${python_code.replace(/\n/g, '__NEWLINE__')}\n`);
};

var blocks = [];
module.exports.blocks = blocks;

function generate_unique_name() {
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
function generate_unique_name_from_name(test_name) {
    // 'usernames' => 'usernames_1' => 'usernames_2'
    var existing_names = blocks.map(block => block.name);
    var number_index = 0;
    var current_test_name = test_name.replace(/\s/g, '_');
    if (_.has(filbert.pythonRuntime, current_test_name) || _.has(filbert.pythonRuntime.functions, current_test_name) || _.has(filbert.pythonRuntime.ops, current_test_name)) {

        // e.g. someone tries to name something 'sum' or 'json'
        current_test_name = '_' + current_test_name;
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
var success_queue = [];
var fail_queue = [];

class Block {

    constructor() {
        this.depends_on = [];
        this.is_string_concat = false;
    } //JSONType;


    toString() {
        return `Block ${this.name}`;
    }
}
module.exports.Block = Block;

function create_block(name, code) {
    var block = new Block();
    if (name) {
        block.name = generate_unique_name_from_name(name);
    } else {
        block.name = generate_unique_name();
    }
    block.code = code;

    blocks.push(block);

    python_declare(block);

    recompute_this_and_dependent_blocks(block);

    return block;
}
module.exports.create_block = create_block;

function python_import(python_code) {
    // e.g. 'import time'
    // e.g. 'from datetime import datetime'

    // @Cleanup: If an import box changes, should delete old names
    success_queue.push(function (data) {});
    fail_queue.push(function (data) {});
    python_exec(python_code);
}
module.exports.python_import = python_import;

// === b ===
// a.split('\n')
// 'itunes:duration' in b_

function python_declare(block) {
    var code = block.code;
    if (block.is_string_concat) {
        var token_re = /\$\{.+?\}/g; // e.g. ${butts}
        var tokens = code.match(token_re);
        if (tokens && tokens.length) {
            tokens.forEach(token => code = code.replace(token, '{}'));
            var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
            code = `"""${code}""".format(${expressions.join(',')})`;
        } else {
            code = `"""${code}"""`;
        }
    }

    var python_filter_function_declaration = '';
    var filter_code = block.filter_clause; // stupid  workaround
    if (filter_code) {
        var python_filter_function_name = `_${block.name}_filter_function`;

        // a_ means 'for a_ in a: ...'
        var map_variables = _.uniq(get_user_identifiers(filter_code).filter(name => _.last(name) == '_' && name !== block.name + '_'));

        if (filter_code.indexOf('return') > -1) {
            // function
            if (map_variables.length > 0) {
                // need arguments
                python_filter_function_declaration = `def ${python_filter_function_name}(${block.name}_, ${map_variables.join(', ')}):
  ${filter_code.split('\n').join('\n  ')}`;
            } else {
                python_filter_function_declaration = `def ${python_filter_function_name}():
  ${filter_code.split('\n').join('\n  ')}`;
            }
        } else {
            // an expression with 0 or more variables
            python_filter_function_declaration = `${python_filter_function_name} = lambda ${block.name}_, ${map_variables.join(', ')}: ${filter_code}`;
            //                                                                            ^-- filter function can refer to its block's results
        }
    }

    // a_ means 'for a_ in a: ...'
    var map_variables = _.uniq(get_user_identifiers(code).filter(name => _.last(name) == '_'));

    var python_function_declaration = '';
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
    }

    var no_op = function () {};
    var success = function (data) {
        block.error = '';
        ui.render_error(block);
    };
    var fail = function (data) {
        success_queue[0] = no_op; // remove callback handling running this function
        success_queue[1] = no_op; // remove callback handling getting the result of this function
        fail_queue[0] = no_op; // remove callback handling running this function
        fail_queue[1] = no_op; // remove callback handling getting the result of this function

        block.error = data;
        ui.render_error(block);
    };

    var filter_declaraction_success = function (data) {
        block.error = '';
        ui.render_error(block);
    };
    var filter_declaration_fail = function (data) {
        if (python_function_declaration) {
            success_queue[0] = no_op; // remove callback for declaring the non-filter function
            success_queue[1] = no_op; // remove callback for running the function
            success_queue[2] = no_op; // remove callback handling getting the result of this function
            fail_queue[0] = no_op; // remove callback for declaring the non-filter function
            fail_queue[1] = no_op; // remove callback handling running this function
            fail_queue[2] = no_op; // remove callback handling getting the result of this function
        } else {
            success_queue[0] = no_op;
            success_queue[1] = no_op;
            fail_queue[0] = no_op; // remove callback calling 
            fail_queue[1] = no_op; // remove callback that handles getting value of variable
        }

        block.error = data;
        ui.render_error(block);
    };

    if (python_filter_function_declaration) {
        success_queue.push(success);
        fail_queue.push(fail);
        python_exec(python_filter_function_declaration);
        console.log('declaring python:', python_filter_function_declaration);
    }

    if (python_function_declaration) {
        success_queue.push(success);
        fail_queue.push(fail);
        python_exec(python_function_declaration);
        console.log('declaring python:', python_function_declaration);
    }
}

function python_run(block) {

    var code = block.code;
    if (block.is_string_concat) {
        var token_re = /\$\{.+?\}/g; // e.g. ${butts}
        var tokens = code.match(token_re);
        if (tokens && tokens.length) {
            tokens.forEach(token => code = code.replace(token, '{}'));
            var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
            code = `"""${code}""".format(${expressions.join(',')})`;
        } else {
            code = `"""${code}"""`;
        }
    }

    var python_code;
    var python_expression;

    // a_ means 'for a_ in a: ...'
    var map_variables = _.uniq(get_user_identifiers(code).filter(name => _.last(name) == '_'));
    if (map_variables.length > 0) {
        var zip_variables = map_variables.map(name => name.slice(0, name.length - 1)); // 'a_' => 'a'

        // can't just use map(f, a,b,c) because python's map uses zip_longest behavior
        python_expression = `starmap(_${block.name}_function, izip(${zip_variables.join(',')}))`;
    } else if (code.indexOf('return') > -1) {
        python_expression = `_${block.name}_function()`;
    } else {
        python_expression = `${code}`;
    }

    if (block.filter_clause) {
        var filter_map_variables = _.uniq(get_user_identifiers(block.filter_clause).filter(name => _.last(name) == '_' && name !== block.name + '_'));
        var filter_zip_variables = filter_map_variables.map(name => name.slice(0, name.length - 1)); // 'a_' => 'a'
        python_expression = `list( starfilter(_${block.name}_filter_function, izip(${filter_zip_variables.join(',')}), ${python_expression}) )`;
    } else if (python_expression.indexOf('starmap') > -1) {
        python_expression = `list(${python_expression})`;
    }

    python_code = `${block.name} = ${python_expression}`;

    console.log('running python:', python_code);

    var no_op = function () {};
    var success = function (data) {
        block.error = '';
        ui.render_error(block);
    };
    var fail = function (data) {
        success_queue[0] = no_op; // remove callback trying to get value of this function
        fail_queue[0] = no_op; // remove callback trying to get value of this function

        block.error = data;
        ui.render_error(block);
    };

    success_queue.push(success);
    fail_queue.push(fail);
    python_exec(python_code);
}

function get_python_value(block) {
    // get the value of an expression
    success_queue.push(function (data) {
        try {
            // for some reason, eval-ing JSON object literals is a syntax error??
            eval(`block.output = ${data}`);
            block.error = '';
            ui.render_error(block);
        } catch (e) {
            throw `Error on evaluating. Data coming out of 'Block ${block.name}' is bad: ${data}`;
        }

        ui.render_output(block);
    });
    fail_queue.push(function (data) {
        block.error = `error in evaling Block ${block.name}! ${data}`;
        ui.render_error(block);
    });
    // console.log('getting python value:', block.name)
    python_interpreter.stdin.write(`__EVAL:stringify(${block.name})\n`);
}

function change_name(block, name) {
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
                    _.zip(tokens, expressions).forEach(function (tokenexpression) {
                        var token = tokenexpression[0];
                        var expression = tokenexpression[1];
                        var new_token = '${' + replace_python_names(expression, old_name, block.name) + '}';
                        test_block.code = test_block.code.replace(token, new_token);
                    });
                }
            } else {
                test_block.code = replace_python_names(test_block.code, old_name, block.name);
                if (test_block.filter_clause) {
                    test_block.filter_clause = replace_python_names(test_block.filter_clause, old_name, block.name);
                }
            }
            ui.render_code(test_block);
        }
    });

    // @TODO!!!!!!: update with filter clause
    var map_variables = _.uniq(get_user_identifiers(block.code).filter(name => _.last(name) === '_'));
    if (block.code.indexOf('return') > -1 || map_variables.length > 0) {
        var old_function_name = `_${old_name}_function`;
        var new_function_name = `_${block.name}_function`;
        var python_code = `${block.name} = ${old_name}; del ${old_name}; ${new_function_name} = ${old_function_name}; del ${old_function_name}`;
    } else {
        var python_code = `${block.name} = ${old_name}; del ${old_name}`;
    }

    var callback = () => {}; //console.log(`Block ${old_name} name changed to ${block.name}`)
    success_queue.push(callback);
    fail_queue.push(callback);
    python_exec(python_code);

    return block.name;
}
module.exports.change_name = change_name;

function set_dependencies(block) {

    var names = [];
    try {
        if (block.is_string_concat) {
            // @Cleanup @Refactor: move this logic to more central location
            var token_re = /\$\{.+?\}/g; // e.g. ${butts}
            var tokens = block.code.match(token_re);
            if (tokens && tokens.length) {
                var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
                expressions.forEach(expression => {
                    var new_names = get_user_identifiers(expression);
                    new_names.forEach(name => names.push(name));
                });
            }
        } else {
            names = get_user_identifiers(block.code);
        }
    } catch (e) {
        // syntax error in filbert parsing most likely
        block.error = e;
        ui.render_error(block);
        return;
    }

    if (block.filter_clause) {
        try {
            get_user_identifiers(block.filter_clause).forEach(function (name) {
                // don't include self-references even though they're valid in filter clauss
                if (name !== block.name && name.slice(0, name.length - 1) !== block.name) {
                    names.push(name);
                }
            });
        } catch (e) {
            // syntax error in filbert parsing most likely
            block.error = e;
            ui.render_error(block);
            return;
        }
    }

    block.depends_on = blocks.filter(function (test_block) {
        return names.includes(test_block.name) || names.includes(test_block.name + '_');
    });
}

function change_code(block, code) {
    block.code = code;

    set_dependencies(block);

    python_declare(block);

    recompute_this_and_dependent_blocks(block);
}
module.exports.change_code = change_code;

function change_filter_clause(block, code) {
    block.filter_clause = code;

    set_dependencies(block);

    python_declare(block);

    recompute_this_and_dependent_blocks(block);
}
module.exports.change_filter_clause = change_filter_clause;

function delete_(block_to_delete) {
    throw 'Need to delete block from interpreter';
    // blocks = _.reject(blocks, block => block === block_to_delete);
    // blocks.forEach(function(block) {
    //     block.depends_on = _.reject(block.depends_on, 
    // })
}
module.exports.delete_ = delete_;

function recompute_this_and_dependent_blocks(updatedBlock) {
    // if a block's value changes, update it and go update all the other blocks that depend on that block
    var updated_blocks = [updatedBlock];
    while (updated_blocks.length) {
        var block = updated_blocks.shift(); // pop off front of array
        python_run(block);
        get_python_value(block);
        blocks.forEach(function (should_update_block) {
            if (should_update_block.depends_on.includes(block)) {
                updated_blocks.push(should_update_block);
            }
        });
    }
}
module.exports.recompute_this_and_dependent_blocks = recompute_this_and_dependent_blocks;