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

module.exports.WARN_ON_CLOSE = true;

if (__dirname.endsWith('build')) {
    var python_interpreter = spawn('python', [__dirname+'/interpreter.py']);
    python_interpreter.on('close', function(data) {
        if (module.exports.WARN_ON_CLOSE) alert("Python processes closed! Probably due to interpreter.py error. Error code: "+data)
    })
    module.exports.python_interpreter = python_interpreter;
} else {
    throw "Can't find interpreter.py, __dirname is: "+__dirname;
}


function get_user_identifiers(python_code: string):string[] {
    var advance_token = filbert.tokenize(python_code)
    var token = advance_token();
    var names = {};
    while (token.type.type !== 'eof') {
        if (token.type.type === 'name') {
            names[token.value] = true;
        }
        token = advance_token();
    }
    // remove all references to built-ins
    var current_names = blocks.map(block => block.name)
    return _.keys(names).filter(key => {
        return !_.has(filbert.pythonRuntime, key) &&
               !_.has(filbert.pythonRuntime.functions, key) &&
               !_.has(filbert.pythonRuntime.ops, key) &&
               (_.contains(current_names, key) || _.contains(current_names, key.slice(0, key.length-1)));
    });
}

function get_user_identifiers_with_positions(python_code: string):Object[] {
    var advance_token = filbert.tokenize(python_code, {locations: true})
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
    var current_names = blocks.map(block => block.name)
    return names_and_positions.filter(location => {
        var key = location.name;
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
    // @TODO @Robustness: keep track of spaces from original string and reinsert them
    while (token.type.type !== 'eof') {
        if (token.value === to_replace) {
            new_code.push(replace_with)
            new_code.push('')
        } else if (token.value === (to_replace+'_')) {
            new_code.push(replace_with+'_')
            new_code.push('')
        } else {
            if (_.isUndefined(token.value)) {
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



var imports: Import[] = [];
module.exports.imports = imports;

class Import {
    code: string;
    error: ?string;
}
module.exports.Import = Import;

function create_import(code: string): Import {
    var import_ = new Import();
    import_.code = code;

    imports.push(import_);
    return import_;
}
module.exports.create_import= create_import;

function change_import_code(import_:Import, code:string) {
    import_.code = code;

    success_queue.push(function(data: string) {
        import_.error = null;
        ui.render_import_error(import_);
    })
    fail_queue.push(function(data: string) {
        import_.error = data;
        ui.render_import_error(import_);
    })
    python_exec(import_.code)
}
module.exports.change_import_code = change_import_code;


class Block {
    name: string;
    depends_on: Block[];
    code: string;
    filter_clause: ?string;
    sort_clause: ?string;
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

    recompute_this_and_dependent_blocks(block);

    return block;
}
module.exports.create_block = create_block;

// === b ===
// a.split('\n')
// 'itunes:duration' in b_

// (want to be able to refer to "self", e.g. b)

function python_declare(block: Block) {
    var code = block.code;
    if (block.is_string_concat) {
        var token_re = /\$\{.+?\}/g // e.g. ${butts}
        var tokens = code.match(token_re)
        if (tokens && tokens.length) {
            tokens.forEach(token => code = code.replace(token, '{}'))
            var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
            code = `return """${code}""".format(${expressions.join(',')})`
        } else {
            code = `return """${code}"""`;
        }
    }




    var python_filter_function_declaration: string = '';
    var filter_code = block.filter_clause; // stupid @flow workaround
    if (filter_code) {
        var python_filter_function_name = `_${block.name}_filter_function`;

        // a_ means 'for a_ in a: ...'
        var map_variables = _.uniq(get_user_identifiers(filter_code).filter( name => _.last(name) == '_' && name !== (block.name+'_') ))

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
            python_filter_function_declaration = `${python_filter_function_name} = lambda ${block.name}_, ${map_variables.join(', ')}: (${filter_code})`;
                                                                                        // ^-- filter function can refer to its own block's results
        }
    }



    var python_function_declaration: string = '';
    var python_function_name = `_${block.name}_function`;
    var argument_names = _.uniq(get_user_identifiers(code)); // can't use Block.depends_on because some identifiers are name e.g. 'a_'


    // turn a() into function, _a_function()
    block.depends_on.forEach(function(parent_block) {
        var re = new RegExp('\\b('+parent_block.name+')\\(', 'g');
        code = code.replace(re, '_$1_function(')
    })


    if (code.indexOf('return') > -1) {
        // function
        python_function_declaration = `def ${python_function_name}(${argument_names}):
  ${code.split('\n').join('\n  ')}`;
    } else {
        // lambda for just an expression
        python_function_declaration = `${python_function_name} = lambda ${argument_names}: (${code})`;
    }




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

    var filter_declaraction_success = function(data: string) {
        block.error = '';
        ui.render_error(block);
    };
    var filter_declaration_fail = function(data: string) {
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
        console.log('declaring python filter:', python_filter_function_declaration)
    }


    if (python_function_declaration) {
        success_queue.push(success);
        fail_queue.push(fail);
        python_exec(python_function_declaration);
        console.log('declaring python:', python_function_declaration)
    }
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
    var python_expression: string;

    // a_ means 'for a_ in a: ...'
    var argument_names = _.uniq(get_user_identifiers(code));
    var has_mapped_variables = _.any(argument_names, name => name.endsWith('_'))
    if (has_mapped_variables) {
        var zip_variables = argument_names.map(name => {
            if (name.endsWith('_')) {
                return name.slice(0,name.length-1); // remove trailing '_'
            }
            return `_iter_repeat(${name})`; // make value into an iterator
        });

        // can't just use map(f, a,b,c) because python's map uses zip_longest behavior
        python_expression = `starmap(_${block.name}_function, izip(${zip_variables.join(',')}))`; // 'startmap(_a_function, izip(a, b))'
    } else {
        python_expression = `_${block.name}_function(${argument_names})`;
    }

    // @TODO @Robustness: should be able to have filter clause using arguments (a_, b) - mapped and non-mapped, right now ignoring non-mapped arguments
    if (block.filter_clause) {
        var filter_map_variables = _.uniq(get_user_identifiers(block.filter_clause).filter( name => _.last(name) == '_' && name !== (block.name+'_') ));
        var filter_zip_variables = filter_map_variables.map(name => name.slice(0,name.length-1)) // 'a_' => 'a'
        python_expression = `tuple( starfilter(_${block.name}_filter_function, izip(${filter_zip_variables.join(',')}), ${python_expression}) )`;
    } else if (python_expression.indexOf('starmap') > -1) {
        // if auto-mapping, make sure to not return iterator and instead return whole list
        python_expression = `tuple(${python_expression})`;
    }

    python_code = `${block.name} = ${python_expression}`;

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
        block.error = `${data}`;
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
                ui.render_code(test_block)

            } else {
                test_block.code = replace_python_names(test_block.code, old_name, block.name);
                ui.render_code(test_block);
                if (test_block.filter_clause) {
                    test_block.filter_clause = replace_python_names(test_block.filter_clause, old_name, block.name);
                    ui.render_filter_clause(test_block);
                }

            }
        }

        var ui_block = _.find(ui.ui_blocks, iter_ui_block => iter_ui_block.block == test_block);
        if (ui_block.visualization_options) {
            ui_block.visualization_options.change_name(old_name, block.name);
        }
    })
    if (block.filter_clause) {
        block.filter_clause = replace_python_names(block.filter_clause, old_name, block.name)
        ui.render_filter_clause(block, old_name);
    }

    var old_function_name = `_${old_name}_function`;
    var new_function_name = `_${block.name}_function`;
    var python_code = `${block.name} = ${old_name}; del ${old_name}; ${new_function_name} = ${old_function_name}; del ${old_function_name};`;

    if (block.filter_clause) {
        var old_filter_function_name = `_${old_name}_filter_function`;
        var new_filter_function_name = `_${block.name}_filter_function`;

        python_code += `${new_filter_function_name} = ${old_filter_function_name}; del ${old_filter_function_name}; ${python_code}`;
    }
    console.log('executing python in `change_name`:', python_code);
    var callback = () => {}; 
    success_queue.push(callback);
    fail_queue.push(callback)
    python_exec(python_code)

    return block.name;
}
module.exports.change_name = change_name;

function set_dependencies(block: Block): boolean {

    var names: string[] = [];
    try {
        if (block.is_string_concat) {
            // @Cleanup @Refactor: move this logic to more central location
            var token_re = /\$\{.+?\}/g; // e.g. ${butts}
            var tokens = block.code.match(token_re);
            if (tokens && tokens.length) {
                var expressions = tokens.map(token => token.replace(/^\$\{/, '').replace(/\}$/, '')); // remove ${ and } from ${butts}, leaving only 'butts'
                expressions.forEach(expression => {
                    var new_names = get_user_identifiers(expression);
                    new_names.forEach(name => names.push(name))
                })
            }
        } else {
            names = get_user_identifiers(block.code);

            // TODO: do more robust cycle detection
            // For now, just trying to catch dumb mistakes
            var is_referrering_to_self = false;
            names.forEach(name => {
                if (name == block.name || name.replace(/_$/, '') == block.name) {
                    is_referrering_to_self = true;
                }
            })
            if (is_referrering_to_self) throw "Can't refer to own block: "+block.name;
        }
    } catch(e) {
        // syntax error in filbert parsing most likely
        block.error = e;
        ui.render_error(block);
        return false;
    }

    if (block.filter_clause) {
        try {
            get_user_identifiers(block.filter_clause).forEach(function(name) {
                // don't include self-references even though they're valid in filter clauss
                if (name !== block.name && name.slice(0,name.length-1) !== block.name) {
                    names.push(name)
                }
            })
        } catch(e) {
            // syntax error in filbert parsing most likely
            block.error = e;
            ui.render_error(block);
            return false;
        }
    }

    block.depends_on = blocks.filter(function(test_block: Block) {
        return names.includes(test_block.name) || names.includes(test_block.name+'_');
    });
    return true;

}

function change_code(block: Block, code: string) {
    block.code = code;

    var success = set_dependencies(block);
    if (!success) return;

    python_declare(block)

    recompute_this_and_dependent_blocks(block);
}
module.exports.change_code = change_code;

function change_filter_clause(block: Block, code: string) {
    block.filter_clause = code; 

    set_dependencies(block);

    python_declare(block);

    recompute_this_and_dependent_blocks(block);
}
module.exports.change_filter_clause = change_filter_clause;

function change_sort_clause(block: Block, code: string) {
    block.sort_clause = code; 

    set_dependencies(block);

    python_declare(block);

    recompute_this_and_dependent_blocks(block);
}
module.exports.change_sort_clause = change_sort_clause;

function remove_filter_clause(block: Block) {
    block.filter_clause = null;

    // @TODO: delete filter clause, rerun code with filter removed
    var python_code = `del _${block.name}_filter_function;`;

    var no_op = function() {};
    success_queue.push(no_op);
    fail_queue.push(no_op);

    console.log('executing python code from `remove_filter_clause`:', python_code);
    python_exec(python_code);


    python_declare(block);
    recompute_this_and_dependent_blocks(block);
}
module.exports.remove_filter_clause = remove_filter_clause;

function remove_sort_clause(block: Block) {
    // @TODO
}
module.exports.remove_sort_clause = remove_sort_clause;

function delete_(block_to_delete: Block) {
    throw 'Need to delete block from interpreter'
    // blocks = _.reject(blocks, block => block === block_to_delete);
    // blocks.forEach(function(block) {
    //     block.depends_on = _.reject(block.depends_on, 
    // })
}
module.exports.delete_ = delete_;

function recompute_this_and_dependent_blocks(updatedBlock: Block):void {
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
module.exports.recompute_this_and_dependent_blocks = recompute_this_and_dependent_blocks;
