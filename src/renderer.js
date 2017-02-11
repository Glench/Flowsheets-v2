// @flow

const $ = require('jquery');
const Block = require('./interpreter').Block;

// var ui = {
//     render_output: function(block: any) {
//         $('.output').text(block.output);
//     },
// };

module.exports.render_output = function(block: Block) {
    $('.output').text(block.output);
};
