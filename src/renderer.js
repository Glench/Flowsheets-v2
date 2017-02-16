// @flow

const $ = require('jquery');
const _ = require('underscore');

const interpreter = require('./interpreter')
const Block = interpreter.Block;


var ui_blocks: UIBlock[] = [];
module.exports.ui_blocks = ui_blocks;

const rows = 100
const columns = 40;
module.exports.rows = rows;
module.exports.columns = columns;

class UIBlock {
    row: number;
    column: number;

    block: Block;
};
module.exports.UIBlock = UIBlock;

function initialize() {
    initialize_grid();
    $('#new-import').on('click', function(evt) {
        create_and_render_import();
    })
}
module.exports.initialize = initialize;

function initialize_grid() {
    for (var row=0; row < rows; ++row) {
        var $tr = $('<tr>')
        for (var column = 0; column < columns; ++column) {
            var onClick = function(row,column) {
                return function(evt) {
                    var block = interpreter.create_block(null, "'hi'");
                    block.depends_on = [interpreter.blocks[0]];
                    create_and_render_block(block, row, column);
                }
            }
            var $td = $('<td>').on('click', onClick(row, column));
            $tr.append($td)
        }
        $('#main').append($tr)
    }
}

function create_and_render_import() {
    var $input = $('<input>').attr('class', 'import');
    $input.on('change', function(evt) {
        interpreter.python_import(evt.target.value)
    })
    $('#imports').append($input)
    $input.focus();
}

function create_and_render_block(block: Block, row: number, column: number) {
    var ui_block = new UIBlock();
    ui_block.row = row;
    ui_block.column = column;
    ui_block.block = block;
    ui_blocks.push(ui_block)

    // update name
    var $name = $('<input>').attr('id', 'name-'+block.name).attr('value', block.name).on('change', function(evt) {
          var old_name = block.name;
          var new_name = interpreter.change_name(block, evt.target.value);

          $(evt.target).val(new_name); // rewrite in case the name changed because of sanitization
          $(evt.target).blur(); 

          $('#code-'+old_name).attr('id', 'code-'+block.name)
          $('#name-'+old_name).attr('id', 'name-'+block.name)
          $('#output-'+old_name).attr('id', 'output-'+block.name)
    }).on('click', function(evt) {
        evt.stopPropagation();
    });
    $('#main tr').eq(row).find('td').eq(column).html($name)


    // update code
    var $code = $('<input>').attr('id', 'code-'+block.name).attr('value', block.code).on('change', function(evt) {
          interpreter.change_code(block, evt.target.value);
    }).on('click', function(evt) {
        evt.stopPropagation();
    })
    $('#main tr').eq(row+1).find('td').eq(column).html($code)
    $code.focus().select();


    var $output = $('<input>').attr('id', 'output-'+block.name).attr('value', block.output).on('click', function(evt) {
        evt.stopPropagation();
    })
    $('#main tr').eq(row+2).find('td').eq(column).html($output)
};
module.exports.create_and_render_block = create_and_render_block;

function render_code(block: Block) {
    var $code = $('#code-'+block.name);
    $code.val(block.code);
    fade_background_color($code, 1, 'rgba(220,220,220, ')
}
module.exports.render_code = render_code;

function render_error(block: Block) {
    var $output = $('#output-'+block.name)
    if (block.error) {
        $output.val(block.error)    
        $output.css('background-color', '#f00')
    } else {
        $output.css('background-color', 'inherit')
    }
}
module.exports.render_error = render_error;

function render_output(block: Block) {
    var $output = $('#output-'+block.name)
    $output.val(block.output);
    fade_background_color($output, 1, 'rgba(255,255,0, ')
};
module.exports.render_output = render_output;

function fade_background_color($element, alpha, color) {
    if (color[3] !== 'a') { throw 'Color needs to start with "rgba"'}
    alpha -= .04
    if (alpha < 0) {
        $element.css('background-color', 'inherit')
        return
    }
    var new_color = color.replace(' ', ` ${alpha})`)
    $element.css('background-color', new_color)
    setTimeout(fade_background_color, 1000/60, $element, alpha, color);
}
