// @flow
const spawn = require('child_process').spawn;
const filbert = require('filbert');
const _ = require('underscore');

const ui = require('./renderer.js');

var python_interpreter = spawn('python', [__dirname+'/interpreter.py']);
module.exports.python_interpreter = python_interpreter;

function get_user_identifiers(python_expression: string) {
    var obj = filbert.parse(python_expression);

    var identifiers = {}; // would use a unique Set object if there was one

    function _walk(current_obj, accumlated_identifiers) {
        _.each(current_obj, (value, key) => {
            if (!value || _.isString(value)) { return; }

            if (value.type === 'Identifier' && !_.has(value, 'userCode')) {
                accumlated_identifiers[value.name] = true;
            }
            _walk(value, accumlated_identifiers)
        })
    }
    _walk(obj, identifiers);
    // only return user codes
    // @Cleanup: will need to make sure identifiers aren't variables written in a function
    return _.keys(identifiers).filter(key => {
        return !_.has(filbert.pythonRuntime, key) &&
               !_.has(filbert.pythonRuntime.functions, key) &&
               !_.has(filbert.pythonRuntime.ops, key);
   });
}
module.exports.get_user_identifiers = get_user_identifiers;

var stdout_accumulation = '';
python_interpreter.stdout.setEncoding('utf8')
python_interpreter.stdout.on('readable', () => {

    var character = python_interpreter.stdout.read(1);

    while (character) {
        character = character.toString();
        if (character === '\n') {

            // run callbacks
            if (fail_queue.length && success_queue.length) {
                var success_func: Function = success_queue.shift();
                fail_queue.shift();
                success_func(stdout_accumulation)
            }

            stdout_accumulation = '';
            character = python_interpreter.stdout.read(1);
            continue
        }

        stdout_accumulation += character; // @Speed? This is probably hella slow. Is .join() faster?
        character = python_interpreter.stdout.read(1);
    }
});


var stderr_accumulation = '';
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
                fail_func(stderr_accumulation)
            }

            stderr_accumulation = '';
            character = python_interpreter.stderr.read(1);
            continue
        }

        stderr_accumulation += character; // @Speed? This is probably hella slow. Is .join() faster?
        character = python_interpreter.stderr.read(1);
    }
});


// The state!
var blocks: Block[] = [];
module.exports.blocks = blocks;

function generate_unique_name():string {
    var existing_names = blocks.map(block => block.name);
    var alpha_index = 'a';
    var current_test_name = alpha_index;
    while (existing_names.indexOf(current_test_name) >= 0) {
        alpha_index = String.fromCharCode(alpha_index.charCodeAt(0) + 1);
        console.log(alpha_index)
        current_test_name = alpha_index;
    }
    return current_test_name;

}
function generate_unique_name_from_name(test_name:string):string {
    var existing_names = blocks.map(block => block.name);
    var number_index = 0;
    var current_test_name = test_name;
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
    output: JSONType;
    error: ?string;

    constructor() {
        this.depends_on = [];
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

    update_other_blocks_because_this_one_changed(block);

    return block;
}
module.exports.create_block = create_block;

function python_declare(block: Block):void {
    // set up an expression or function to run. equivalent to a declaration.
    success_queue.push(function(data: string) {
        block.error = ''
        ui.render_output(block);
    });
    fail_queue.push(function(data: string) {
        block.error = data;

        // remove next command, which is always an EVAL for the same variable
        success_queue.shift()
        fail_queue.shift()

        ui.render_output(block);
    });
    var python_code = `${block.name} = ${block.code}`
    python_interpreter.stdin.write(`__EXEC:${python_code.replace('\n', '__NEWLINE__')}\n`)
}

function python_evaluate(block: Block):void {
    // get the value of an expression
    success_queue.push(function(data: string) {
        // console.log(`eval ran successfully for "Block ${block.name}"`)
        try {
            // for some reason, eval-ing JSON object literals is a syntax error??
            eval(`block.output = ${data}`);
            block.error = '';
        } catch(e) {
            throw `Error on evaluating. Data coming out of 'Block ${block.name}' is bad: ${data}`;
        }

        ui.render_output(block);
    });
    fail_queue.push(function(data: string) {
        throw `error in evaling Block ${block.name}! ${data}`;
    });
    python_interpreter.stdin.write(`__EVAL:json.dumps(${block.name})\n`)
}

function change_name(block: Block, name: string):string {
    var old_name = block.name;
    block.name = generate_unique_name_from_name(name);

    var python_code = `${block.name} = ${old_name}; del ${old_name}`;

    var callback = () => console.log(`Block ${old_name} name changed to ${block.name}`)
    success_queue.push(callback);
    fail_queue.push(callback)
    python_interpreter.stdin.write(`__EXEC:${python_code}\n`)

    return block.name;
}
module.exports.change_name = change_name;

function change_code(block: Block, code: string) {
    block.code = code;

    // update dependencies
    try {
        var names = get_user_identifiers(block.code);
    } catch(e) {
        // syntax error
        block.error = e;
        ui.render_output(block);
        return
    }

    // @Cleanup: detect cyclical dependencies more formally, not just self reference
    if (_.contains(names, block.name)) {
        block.error = "Can't refer to self with name \""+ block.name +"\"";
        ui.render_output(block);
        return
    }

    block.depends_on = blocks.filter(function(test_block: Block) {
        return _.contains(names, test_block.name);
    });

    update_other_blocks_because_this_one_changed(block);
}
module.exports.change_code = change_code;

function update_other_blocks_because_this_one_changed(updatedBlock: Block):void {
    // if a block's value changes, go find all the other blocks that depend on that block and update them
    var updated_blocks: Block[] = [updatedBlock];
    while (updated_blocks.length) {
        var block = updated_blocks.shift(); // pop off front of array
        python_declare(block); // @Cleanup: should refactor so expressions get run as functions
        python_evaluate(block); 
        blocks.forEach(function(should_update_block:Block) {
            if (should_update_block.depends_on.includes(block)) {
                updated_blocks.push(should_update_block)
            }
        }) 
    }
}
module.exports.update_other_blocks_because_this_one_changed = update_other_blocks_because_this_one_changed;





// testing
/*
var block1 = new Block();
block1.name = 'a';
block1.code = 'a = 1'
blocks.push(block1)

var block2 = new Block();
block2.name = 'b'
block2.code = 'b = a+1'
block2.depends_on.push(block1);
blocks.push(block2)

var block3 = new Block();
block3.name = 'c'
block3.code = 'c = a+3'
block3.depends_on.push(block1);
blocks.push(block3)

var block4 = new Block();
block4.name = 'd'
block4.code = 'd = "d"'
blocks.push(block4)

var block5 = new Block();
block5.name = 'e'
block5.code = 'e = c*"e"'
block5.depends_on.push(block3);
blocks.push(block5)

update_other_blocks_because_this_one_changed(block1)
*/

// python_declare(block1)
// python_declare(block2)

// python_evaluate(block1)
// python_evaluate(block2)






