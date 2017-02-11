const spawn = require('child_process').spawn;

var python_interpreter = spawn('python', [__dirname + '/interpreter.py']);

python_interpreter.stdout.on('data', data => {
    var success_func = success_queue.shift();
    success_func(data.toString());
    fail_queue.shift();
});

python_interpreter.stderr.on('data', data => {
    var fail_func = fail_queue.shift();
    fail_func(data.toString());
    success_queue.shift();
});

python_interpreter.on('close', function (code) {
    console.error(`python process exited unexpectedly!`);
    alert(`python process exited unexpectedly!`);
});

// The state!
var blocks = [];

// Basically queue up commands to run on the python processes's stdin,
// and queue up what to do if a command succeeds or fails as well. If
// it succeeds, then the fail function is thrown away. If it fails,
// then the succeed function is thrown away.
var success_queue = [];
var fail_queue = [];

class Block {

    constructor() {
        this.depends_on = [];
    }

    toString() {
        return `Block ${this.name}`;
    }
}

function python_declare(block) {
    // set up an expression or function to run. equivalent to a declaration.
    success_queue.push(function (data) {
        console.log('executed yay!');
    });
    fail_queue.push(function (data) {
        console.log('error in exec!', data);
        block.error = data;
    });
    python_interpreter.stdin.write(`__EXEC:${block.code.replace('\n', '__NEWLINE__')}\n`);
}

function python_evaluate(block) {
    // get the value of an expression
    success_queue.push(function (data) {
        console.log('evaled yay!', data);
        block.output = eval(data);
    });
    fail_queue.push(function (data) {
        console.log('error in eval!', data);
    });
    python_interpreter.stdin.write(`__EVAL:json.dumps(${block.name})\n`);
}

function update_other_blocks_because_this_one_changed(updatedBlock) {
    // if a block's value changes, go find all the other blocks that depend on that block and update them
    var updated_blocks = [updatedBlock];
    while (updated_blocks.length) {
        var block = updated_blocks.shift(); // pop off front of array
        python_declare(block); // @Cleanup: should refactor so expressions get run as functions
        python_evaluate(block);
        blocks.forEach(function (should_update_block) {
            if (should_update_block.depends_on.includes(block)) {
                updated_blocks.push(should_update_block);
            }
        });
    }
}

// testing
var block1 = new Block();
block1.name = 'a';
block1.code = 'a = 1';
blocks.push(block1);

var block2 = new Block();
block2.name = 'b';
block2.code = 'b = a+1';
block2.depends_on.push(block1);
blocks.push(block2);

var block3 = new Block();
block3.name = 'c';
block3.code = 'c = a+3';
block3.depends_on.push(block1);
blocks.push(block3);

var block4 = new Block();
block4.name = 'd';
block4.code = 'd = "d"';
blocks.push(block4);

var block5 = new Block();
block5.name = 'e';
block5.code = 'e = c*"e"';
block5.depends_on.push(block3);
blocks.push(block5);

update_other_blocks_because_this_one_changed(block1);

// python_declare(block1)
// python_declare(block2)

// python_evaluate(block1)
// python_evaluate(block2)


module.exports = {
    python_interpreter: python_interpreter,
    blocks: blocks,
    update_other_blocks_because_this_one_changed: update_other_blocks_because_this_one_changed
};