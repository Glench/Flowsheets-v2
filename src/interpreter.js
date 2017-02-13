// @flow
const spawn = require('child_process').spawn;
const ui = require('./renderer.js');

var python_interpreter = spawn('python', [__dirname+'/interpreter.py']);

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

function create_block(name: string, code: string) {
    var block = new Block();
    block.name = name;
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
        console.log(`eval ran successfully for "Block ${block.name}"`)
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

function change_name(block: Block, name: string) {
    var old_name = block.name;
    block.name = name;

    var python_code = `${block.name} = ${old_name}; del ${old_name}`;
    console.log(python_code)

    var callback = () => console.log(`Block ${old_name} name changed to ${block.name}`)
    success_queue.push(callback);
    fail_queue.push(callback)
    python_interpreter.stdin.write(`__EXEC:${python_code}\n`)
}
module.exports.change_name = change_name;

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






module.exports.Block = Block;
module.exports.python_interpreter = python_interpreter;
module.exports.blocks = blocks;
module.exports.update_other_blocks_because_this_one_changed = update_other_blocks_because_this_one_changed;
