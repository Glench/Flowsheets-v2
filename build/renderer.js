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

function initialize_grid() {
    for (var row = 0; row < rows; ++row) {
        var $tr = $('<tr>');
        for (var column = 0; column < columns; ++column) {
            var onClick = function (row, column) {
                return function (evt) {
                    var block = interpreter.create_block(null, '10+20');
                    create_block(block, row, column);
                };
            };
            var $td = $('<td>').on('click', onClick(row, column));
            $tr.append($td);
        }
        $('#main').append($tr);
    }
}
module.exports.initialize_grid = initialize_grid;

function create_block(block, row, column) {
    var ui_block = new UIBlock();
    ui_block.row = row;
    ui_block.column = column;
    ui_block.block = block;
    ui_blocks.push(ui_block);

    // update name
    var $name = $('<input>').attr('id', 'name-' + block.name).attr('value', block.name).on('change', function (evt) {
        console.log('name change!');
        var old_name = block.name;
        var new_name = interpreter.change_name(block, evt.target.value);
        console.log(evt.target, new_name);
        $(evt.target).val(new_name);

        $('#code-' + old_name).attr('id', 'code-' + block.name);
        $('#name-' + old_name).attr('id', 'name-' + block.name);
        $('#output-' + old_name).attr('id', 'output-' + block.name);
    }).on('click', function (evt) {
        evt.stopPropagation();
    });
    $('#main tr').eq(row).find('td').eq(column).html($name);

    // update code
    var $code = $('<input>').attr('id', 'code-' + block.name).attr('value', block.code).on('change', function (evt) {
        console.log('code change!');
        interpreter.change_code(block, evt.target.value);
    }).on('click', function (evt) {
        evt.stopPropagation();
    });
    $('#main tr').eq(row + 1).find('td').eq(column).html($code);

    var $output = $('<input>').attr('id', 'output-' + block.name).attr('value', block.output).on('click', function (evt) {
        evt.stopPropagation();
    });
    $('#main tr').eq(row + 2).find('td').eq(column).html($output);
};
module.exports.create_block = create_block;

function render_output(block) {
    var $output = $('#output-' + block.name);
    if (block.error) {
        $output.attr('value', block.error);
    } else {
        $output.attr('value', block.output);
    }
};
module.exports.render_output = render_output;