const $ = require('jquery');
const Block = require('./interpreter').Block;

// var ui = {
//     render_output: function(block: any) {
//         $('.output').text(block.output);
//     },
// };

module.exports.render_output = function (block) {
    $('.output').text(block.output);
};