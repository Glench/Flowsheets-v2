const $ = require('jquery');
const interpreter = require('./interpreter');
const Block = interpreter.Block;

var ui_blocks = [];
module.exports.ui_blocks = ui_blocks;

const rows = 100;
const columns = 40;
module.exports.rows = rows;
module.exports.columns = columns;

class UIBlock {};
module.exports.UIBlock = UIBlock;

module.exports.initialize_grid = function () {
    for (var row = 0; row < rows; ++row) {
        var $tr = $('<tr>');
        for (var column = 0; column < columns; ++column) {
            $tr.append($('<td>'));
        }
        $('#main').append($tr);
    }
};

module.exports.create_block = function (block, row, column) {
    var ui_block = new UIBlock();
    ui_block.row = row;
    ui_block.column = column;
    ui_block.block = block;
    ui_blocks.push(ui_block);

    var $code = $('<input>').attr('id', 'code-' + block.name).attr('value', block.code).on('change', function (evt) {
        console.log('code change!');
        block.code = evt.target.value;
        interpreter.update_other_blocks_because_this_one_changed(block);
    });
    $('#main tr').eq(row).find('td').eq(column).html($code);

    var $name = $('<input>').attr('id', 'name-' + block.name).attr('value', block.name).on('change', function (evt) {
        console.log('name change!');
        block.name = evt.target.value;
    });
    $('#main tr').eq(row + 1).find('td').eq(column).html($name);

    var $output = $('<input>').attr('id', 'output-' + block.name).attr('value', block.output);
    $('#main tr').eq(row + 2).find('td').eq(column).html($output);
};

module.exports.render_output = function (block) {
    $('#output-' + block.name).attr('value', block.output);
};