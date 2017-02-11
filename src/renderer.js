// @flow

const $ = require('jquery');
const interpreter = require('./interpreter.js')

var block = new interpreter.Block();
block.name = 'a'
interpreter.blocks.push(block)

$('[name="code"').on('change', function(evt) {
    console.log('code change!', )
    var block = interpreter.blocks[0];
    block.code = evt.target.value;
    interpreter.update_other_blocks_because_this_one_changed(block)
})

$('[name="name"]').on('change', function(evt) {
    console.log('name change!')
    var block = interpreter.blocks[0];
    block.name = evt.target.value;
})

var ui = {
    render_output: function(block: interpreter.Block) {
        $('.output').text(block.output);
    },
};

module.exports = ui;