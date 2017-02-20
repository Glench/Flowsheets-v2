const $ = require('jquery');
const _ = require('underscore');

function clamp(num, min, max) {
    if (num < min) {
        return min;
    } else if (num > max) {
        return max;
    }
    return num;
}

const interpreter = require('./interpreter');
const Block = interpreter.Block;

var ui_blocks = [];
module.exports.ui_blocks = ui_blocks;

const rows = 100;
const columns = 30;
const cell_width = 88; // including borders
const cell_height = 19; // including borders

class UIBlock {
    // in # of rows
    constructor() {
        this.name_height = 1;
        this.code_height = 1;
        this.output_height = 1;
    } // in # of rows

    // in # of rows
};
module.exports.UIBlock = UIBlock;

function initialize() {
    initialize_grid();

    $('#new-import').on('click', function (evt) {
        create_and_render_import();
    });
}
module.exports.initialize = initialize;

function initialize_grid() {
    var $main = $('canvas#main');
    var height = rows * cell_height;
    var width = columns * cell_width;
    var canvas = $main.get(0);

    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext('2d');

    ctx.translate(0.5, 0.5);
    for (var row = 0; row < rows; ++row) {
        // draw rows horizontally
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(0, row * cell_height);
        ctx.lineTo(width, row * cell_height);
        ctx.stroke();
        ctx.closePath();
    }

    for (var column = 0; column < columns; ++column) {
        ctx.beginPath();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.moveTo(column * cell_width, 0);
        ctx.lineTo(column * cell_width, height);
        ctx.stroke();
        ctx.closePath();
    }
    ctx.translate(-0.5, -0.5);

    $main.on('click', function (evt) {
        var column = Math.floor((evt.offsetX - 2) / cell_width);
        var row = Math.floor((evt.offsetY - 2) / cell_height);

        var last_block = _.last(interpreter.blocks);
        var block = interpreter.create_block(null, last_block.name);
        block.depends_on = [last_block];
        create_and_render_block(block, row, column);
    });
}

function create_and_render_import() {
    var $input = $('<input>').attr('class', 'import');
    $input.on('change', function (evt) {
        interpreter.python_import(evt.target.value);
    });
    $('#imports').append($input);
    $input.focus();
}

function create_and_render_block(block, row, column) {
    var ui_block = new UIBlock();
    ui_block.row = row;
    ui_block.column = column;
    ui_block.block = block;
    ui_blocks.push(ui_block);

    var $block = $('<div>').attr('id', 'block-' + block.name).attr('class', 'block');
    $block.css({
        top: row * cell_height + 1,
        left: column * cell_width + 1,
        height: 3 * cell_height - 1,
        width: cell_width - 1
    });

    // name
    var $name = $('<div class="name">');
    $name.append($('<input>').attr('value', block.name).on('change', function (evt) {
        var old_name = block.name;
        var new_name = interpreter.change_name(block, evt.target.value);

        $(evt.target).val(new_name); // rewrite in case the name changed because of sanitization
        $(evt.target).blur();

        $(evt.target).parents('.block').attr('id', 'block-' + new_name);
    }).on('click', function (evt) {
        evt.stopPropagation();
    }));
    $block.append($name);

    // code
    var $code = $('<div class="code">');
    $code.append($('<input>').attr('value', block.code).attr('placeholder', 'python code').on('change', function (evt) {
        interpreter.change_code(block, evt.target.value);
    }).on('change', function (evt) {
        evt.stopPropagation();
    }));
    $block.append($code);
    $code.find('input').focus().select();

    // output


    var $output = $('<div class="output">');
    $output.append($('<input>').attr('value', block.output).on('click', function (evt) {
        evt.stopPropagation();
    }));
    $block.append($output);

    $('#blocks').append($block);
};
module.exports.create_and_render_block = create_and_render_block;

function resize(ui_block) {}

function render_code(block) {
    var $code_input = $('#block-' + block.name).find('.code input');
    $code_input.val(block.code);
    fade_background_color($code_input, 1, 'rgba(220,220,220, ');
}
module.exports.render_code = render_code;

function render_error(block) {
    var $output = $('#block-' + block.name).find('.output input');
    if (block.error) {
        $output.val(block.error);
        $output.css('background-color', '#f00');
    } else {
        $output.css('background-color', 'inherit');
    }
}
module.exports.render_error = render_error;

function resize(ui_block) {
    var $block = $('#block-' + ui_block.block.name);
    $block.css('height', cell_height * (ui_block.name_height + ui_block.code_height + ui_block.output_height));

    $block.find('.output input').filter(index => index >= ui_block.output_height).remove();
    $block.find('.output').css('height', cell_height * ui_block.output_height);
}

function render_output(block) {
    var ui_block = ui_blocks.filter(ui_block => ui_block.block === block)[0];

    var $block = $('#block-' + block.name);
    var $output = $block.find('.output');

    if (_.isArray(block.output) || _.isObject(block.output)) {
        ui_block.output_height = clamp(_.size(block.output), 1, 20);
        var i = 0;
        _.each(block.output, function (item, index) {
            if (i > ui_block.output_height) {
                return;
            }

            var $input = $output.find('input').eq(i);
            if ($input.length === 0) {
                $input = $('<input>');
                $output.append($input);
            }

            if (_.isArray(block.output)) {
                $input.val(block.output[index]);
            } else {
                $input.val('' + index + ': ' + block.output[index]);
            }
            i += 1;
        });
    } else if (block.output !== null) {
        ui_block.output_height = 1;
        $output.find('input').val(block.output.toString());
    } else {
        ui_block.output_height = 1;
        $output.find('input').val('None');
    }

    resize(ui_block);

    fade_background_color($output.find('input'), 1, 'rgba(255,255,0, ');
};
module.exports.render_output = render_output;

function fade_background_color($element, alpha, color) {
    if (color[3] !== 'a') {
        throw 'Color needs to start with "rgba"';
    }
    alpha -= .04;
    if (alpha < 0) {
        $element.css('background-color', 'inherit');
        return;
    }
    var new_color = color.replace(' ', ` ${alpha})`);
    $element.css('background-color', new_color);
    setTimeout(fade_background_color, 1000 / 60, $element, alpha, color);
}