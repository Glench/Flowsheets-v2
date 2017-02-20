// @flow

const $ = require('jquery');
const _ = require('underscore');

// @Cleanup: probably move to utils at some point
function clamp(num: number, min: number, max: number):number {
    if (num < min) {
        return min
    } else if (num > max) {
        return max
    }
    return num;
}

const interpreter = require('./interpreter')
const Block = interpreter.Block;


var ui_blocks: UIBlock[] = [];
module.exports.ui_blocks = ui_blocks;

const rows = 100
const columns = 30;
const cell_width = 88; // including borders
const cell_height = 19; // including borders

class Resize_Drag {
    x: number;
    y: number;
    ui_block: UIBlock;
    original_width_in_columns: number;
    original_output_height: number;
}

var drag_start: ?Resize_Drag = null;

class UIBlock {
    row: number;
    column: number;

    should_auto_resize: boolean;
    width_in_columns: number;

    name_height: number; // in # of rows
    code_height: number; // in # of rows
    output_height: number; // in # of rows

    block: Block;

    constructor() {
        this.should_auto_resize = true;
        this.width_in_columns = 1;

        this.name_height = 1;
        this.code_height = 1;
        this.output_height = 1;
    }
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
    var $main = $('canvas#main')
    var height = rows*cell_height;
    var width = columns*cell_width;
    var canvas = $main.get(0)

    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext('2d');

    ctx.translate(0.5, 0.5);
    for (var row = 0; row < rows; ++row) {
        // draw rows horizontally
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(0, row*cell_height);
        ctx.lineTo(width, row*cell_height);
        ctx.stroke();
        ctx.closePath();
    }

    for (var column = 0; column < columns; ++column) {
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(column*cell_width, 0);
        ctx.lineTo(column*cell_width, height);
        ctx.stroke();
        ctx.closePath();
    }
    ctx.translate(-0.5, -0.5);


    $main.on('click', function(evt) {
        var column = Math.floor((evt.offsetX-2) / cell_width);
        var row = Math.floor((evt.offsetY-2) / cell_height);

        var last_block = _.last(interpreter.blocks);
        var block = interpreter.create_block(null, last_block.name);
        block.depends_on = [last_block];
        create_and_render_block(block, row, column)
    });

    $('body').on('mouseup', reset_dragging)

    $('body').on('mousemove', function(evt) {
        if (drag_start) {
            drag_start.ui_block.should_auto_resize = false;

            var dx = evt.pageX - drag_start.x;
            var dy = evt.pageY - drag_start.y;

            var new_columns = Math.floor(dx/cell_width);
            if (dx % cell_width > cell_width/3) {
                new_columns = Math.ceil(dx/cell_width);
            }
            drag_start.ui_block.width_in_columns = clamp(drag_start.original_width_in_columns + new_columns, 1, columns);

            var new_rows = Math.floor(dy/cell_height);
            if (dy % cell_height > cell_height/3) {
                new_rows = Math.ceil(dy/cell_height);
            }
            drag_start.ui_block.output_height = clamp(drag_start.original_output_height + new_rows, 1, rows);

            resize(drag_start.ui_block)
        }
    })
}

function create_and_render_import() {
    var $input = $('<input>').attr('class', 'import');
    $input.on('change', function(evt) {
        interpreter.python_import(evt.target.value)
    })
    $('#imports').append($input)
    $input.focus();
}

function reset_dragging(evt) {
    evt.preventDefault();
    $('#main').css('cursor', 'inherit');
    drag_start = null;
}

function create_and_render_block(block: Block, row: number, column: number) {
    var ui_block = new UIBlock();
    ui_block.row = row;
    ui_block.column = column;
    ui_block.block = block;
    ui_blocks.push(ui_block)

    var $block = $('<div>').attr('id', 'block-'+block.name).attr('class', 'block')
    $block.css({
        top: row*cell_height + 1,
        left: column*cell_width + 1,  
        height: 3*cell_height-1,
        width: cell_width-1,
    })

    // name
    var $name = $('<div class="name">')
    $name.append($('<input>').attr('value', block.name).on('change', function(evt) {
          var old_name = block.name;
          var new_name = interpreter.change_name(block, evt.target.value);

          $(evt.target).val(new_name); // rewrite in case the name changed because of sanitization
          $(evt.target).blur(); 

          $(evt.target).parents('.block').attr('id', 'block-'+new_name)

    }).on('click', function(evt) {
        evt.stopPropagation();
    }));
    $block.append($name);


    // code
    var $code = $('<div class="code">')
    $code.append($('<input>').attr('value', block.code).attr('placeholder', 'python code').on('change', function(evt) {
        interpreter.change_code(block, evt.target.value);
    }).on('change', function(evt) {
        evt.stopPropagation();
    }))
    $block.append($code);
    $code.find('input').focus().select();

    // output
    var $output = $('<div class="output">');
    $output.append($('<input>').attr('value', block.output).on('click', function(evt) {
        evt.stopPropagation();
    }));
    $block.append($output)

    // resize handle
    var $resize = $('<div class="resize-handle">')
    $resize.on('mousedown', function(evt) {
        evt.preventDefault();

        drag_start = new Resize_Drag();
        drag_start.x = evt.pageX;
        drag_start.y = evt.pageY;
        drag_start.ui_block = ui_block;
        drag_start.original_width_in_columns = ui_block.width_in_columns;
        drag_start.original_output_height = ui_block.output_height;

        $('#main').css('cursor', 'nwse-resize');
    }).on('mouseup', reset_dragging);
    $block.append($resize)

    $('#blocks').append($block);
};
module.exports.create_and_render_block = create_and_render_block;

function render_code(block: Block) {
    var $code_input = $('#block-'+block.name).find('.code input');
    $code_input.val(block.code);
    fade_background_color($code_input, 1, 'rgba(220,220,220, ')
}
module.exports.render_code = render_code;

function render_error(block: Block) {
    var $output = $('#block-'+block.name).find('.output input')
    if (block.error) {
        $output.val(block.error)    
        $output.css('background-color', '#f00')
    } else {
        $output.css('background-color', 'inherit')
    }
}
module.exports.render_error = render_error;

function resize(ui_block: UIBlock) {
    var $block = $('#block-'+ui_block.block.name)

    $block.css('width', ui_block.width_in_columns*cell_width);
    $block.css('height', cell_height*(ui_block.name_height+ui_block.code_height+ui_block.output_height));

    $block.find('.output input').filter(index => index >= ui_block.output_height).remove();
    $block.find('.output').css('height', cell_height*ui_block.output_height);
}

function render_output(block: Block) {
    var ui_block = ui_blocks.filter(ui_block => ui_block.block === block)[0];

    var $block = $('#block-'+block.name)
    var $output = $block.find('.output')

    if (_.isArray(block.output) || _.isObject(block.output)) {
        ui_block.output_height = clamp(_.size(block.output), 1, 20);
        var i = 0;
        _.each(block.output, function(item, index) {
            if (i > ui_block.output_height) { return; }

            var $input = $output.find('input').eq(i)
            if ($input.length === 0) {
                $input = $('<input>')
                $output.append($input)
            }

            if (_.isArray(block.output)) {
                $input.val(block.output[index])
            } else {
                $input.val(''+index+': '+block.output[index])
            }
            i += 1;
        })
    } else if (block.output !== null) {
        ui_block.output_height = 1;
        $output.find('input').val(block.output.toString());
    } else {
        ui_block.output_height = 1;
        $output.find('input').val('None')
    }

    if (ui_block.should_auto_resize) {
        resize(ui_block)
    }

    fade_background_color($output.find('input'), 1, 'rgba(255,255,0, ')
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
