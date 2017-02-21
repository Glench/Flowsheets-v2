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

class Move_Drag {
    start_x: number;
    start_y: number;

    ui_block: UIBlock;

    is_dragging(x:number, y:number):boolean {
        var dx = Math.abs(this.start_x - x);
        var dy = Math.abs(this.start_y - y);
        return Math.max(dx, dy) > 3;
    }
}

class Resize_Drag {
    x: number;
    y: number;
    ui_block: UIBlock;
    original_width_in_columns: number;
    original_output_height: number;
}

var resize_drag: ?Resize_Drag = null;
var move_drag: ?Move_Drag = null;

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

    $('body').on('mouseup', reset_dragging);

    $('body').on('mousemove', function(evt) {
        if (resize_drag) {
            resize_drag.ui_block.should_auto_resize = false;

            var dx = evt.pageX - resize_drag.x;
            var dy = evt.pageY - resize_drag.y;

            var new_columns = Math.floor(dx/cell_width);
            if (dx % cell_width > cell_width/3) {
                new_columns = Math.ceil(dx/cell_width);
            }
            resize_drag.ui_block.width_in_columns = clamp(resize_drag.original_width_in_columns + new_columns, 1, columns);

            var new_rows = Math.floor(dy/cell_height);
            if (dy % cell_height > cell_height/3) {
                new_rows = Math.ceil(dy/cell_height);
            }
            resize_drag.ui_block.output_height = clamp(resize_drag.original_output_height + new_rows, 1, rows);

            resize(resize_drag.ui_block)
        } else if (move_drag) {
            if (move_drag.is_dragging(evt.pageX, evt.pageY)) {
                var grid = document.querySelector('#main');
                if (!grid) { return; } // extraneous code for @flow
                var x_wrt_grid = evt.pageX - grid.clientLeft + 1;
                var y_wrt_grid = evt.pageY - grid.clientTop + 1;

                // @Cleanup
                move_drag.ui_block.row = Math.floor(y_wrt_grid / cell_height);
                move_drag.ui_block.column = Math.floor(x_wrt_grid / cell_width);

                resize(move_drag.ui_block)
            }
        }
    });
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
    resize_drag = null;
    move_drag = null;
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
    $name.append($('<input>').attr('value', block.name).attr('readOnly', true).on('change', function(evt) {
          var old_name = block.name;
          var new_name = interpreter.change_name(block, evt.target.value);

          var $input = $(evt.target);
          $input.val(new_name); // rewrite in case the name changed because of sanitization
          $input.blur(); 
          $input.attr('readOnly', true)

          $input.parents('.block').attr('id', 'block-'+new_name)

    }).on('mousedown', function(evt) {
        evt.preventDefault();
        move_drag = new Move_Drag();
        move_drag.ui_block = ui_block;
        move_drag.start_x = evt.pageX;
        move_drag.start_y = evt.pageY;
    }).on('dblclick', function(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        move_drag = null;

        // edit name
        var $target = $(evt.target);
        $target.removeAttr('readOnly')
        $target.focus();
        $target.select();
    }) );
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

        resize_drag = new Resize_Drag();
        resize_drag.x = evt.pageX;
        resize_drag.y = evt.pageY;
        resize_drag.ui_block = ui_block;
        resize_drag.original_width_in_columns = ui_block.width_in_columns;
        resize_drag.original_output_height = ui_block.output_height;

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

    $block.css({
        top: ui_block.row*cell_height + 1,
        left: ui_block.column*cell_width + 1,
        width: ui_block.width_in_columns*cell_width-1,
        height: cell_height*(ui_block.name_height+ui_block.code_height+ui_block.output_height)-1,
    })

    $block.find('.output input').filter(index => index >= ui_block.output_height).remove();
    $block.find('.output').css('height', cell_height*ui_block.output_height - 1);
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

    resize(ui_block)

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
