const fs = require('fs');
const _ = require('underscore');
const React = require('react');
const $ = require('jquery');
const diff = require('diff');

const interpreter = require('./interpreter');
const ui = require('./renderer');
const cell_height = ui.cell_height;

function fade_background_color($element, alpha, color) {
    if (color[3] !== 'a') {
        throw 'Color needs to start with "rgba"';
    }
    alpha -= .04;
    if (alpha < 0) {
        $element.css('background-color', 'transparent');
        return;
    }
    var new_color = color.replace(' ', ` ${alpha})`);
    $element.css('background-color', new_color);
    setTimeout(fade_background_color, 1000 / 60, $element, alpha, color);
}

class DefaultViz extends React.Component {

    constructor(props) {
        super(props);
        this.scroll = _.throttle(this.scroll, 17).bind(this);

        this.state = { render_start: 0 };
        this.should_flash = true;
    }

    componentDidMount() {
        this.flash_yellow();
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.should_flash) {
            this.flash_yellow();
        } else {
            this.should_flash = true;
        }
    }

    flash_yellow() {
        var $inputs = $(this.refs.container).find('input');
        if ($inputs.length == 0) {
            $inputs = $(this.refs.container).find('pre');
        }
        fade_background_color($inputs, 1, 'rgba(255,255,0, ');
    }

    scroll(evt) {
        if (!_.isObject(this.props.block.output) || !_.isArray(this.props.block.output) || this.props.block.error) {
            return;
        }

        // scroll parent nodes
        this.props.block.depends_on.forEach(parent_block => {
            var $parent_block_output = $('#block-' + parent_block.name).find('.output > *');
            if ($parent_block_output.scrollTop() != this.refs.scrollable.scrollTop) {
                $parent_block_output.scrollTop(this.refs.scrollable.scrollTop);
            }
        });

        // scroll children nodes
        interpreter.blocks.forEach(test_block => {
            if (test_block.depends_on.includes(this.props.block)) {
                var $test_block_output = $('#block-' + test_block.name).find('.output > *');
                if ($test_block_output.scrollTop() != this.refs.scrollable.scrollTop) {
                    $test_block_output.scrollTop(this.refs.scrollable.scrollTop);
                }
            }
        });

        this.should_flash = false;
        this.setState({ render_start: Math.floor(this.refs.scrollable.scrollTop / cell_height) });
    }

    render() {
        var length = 1;

        var inputStyle = {
            height: cell_height - 2,
            display: 'block',
            width: '99%',
            border: 0,
            padding: '0 3px 2px 3px',
            backgroundColor: 'transparent'
        };

        if (_.isArray(this.props.block.output) || _.isObject(this.props.block.output)) {
            length = _.size(this.props.block.output);
            var outputElement = []; //  hack;

            outputElement.push(React.createElement('div', { key: 'scroll-buffer-start', style: { height: this.state.render_start * cell_height } }));

            var i = 0;
            _.each(this.props.block.output, (item, index, output) => {
                if (i < this.state.render_start || i > this.state.render_start + this.props.ui_block.output_height) {
                    i += 1;
                    return;
                }

                if (_.isArray(this.props.block.output)) {
                    outputElement.push(React.createElement('input', { style: inputStyle, value: !_.isUndefined(item.repr) ? item.repr : item, key: `${index}-${item}`, readOnly: true }));
                } else {
                    outputElement.push(React.createElement('input', { style: inputStyle, value: '' + JSON.stringify(index) + ': ' + JSON.stringify(item), readOnly: true }));
                }
                i += 1;
            });

            outputElement.push(React.createElement('div', {
                key: 'scroll-buffer-end',
                style: {
                    height: (length - (this.state.render_start + this.props.ui_block.output_height)) * cell_height
                }
            }));

            outputElement.push(React.createElement('div', { key: 'length', style: {
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    fontSize: 9,
                    padding: '2px',
                    border: '1px solid #ddd',
                    backgroundColor: '#eee',
                    fontFamily: 'Clear Sans, Helvetica Neue, sans-serif',
                    fontWeight: 'bold'
                } }, 'Length: ' + length));
        } else if (_.isString(this.props.block.output)) {
            var outputElement = React.createElement('pre', { style: { width: '99%', height: '100%', border: 0, fontFamily: "Helvetica", padding: 3, margin: 0, backgroundColor: 'transparent' }, readOnly: true }, '"' + this.props.block.output + '"');
        } else {
            var outputElement = React.createElement('input', { style: inputStyle, value: JSON.stringify(this.props.block.output), readOnly: true });
        }
        return React.createElement('div', { ref: 'scrollable', onScroll: this.scroll }, React.createElement('div', { ref: 'container', style: { height: cell_height * length } }, outputElement));
    }
}
module.exports.DefaultViz = DefaultViz;

class RenderedHTMLViz extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        var src = 'data:text/html;charset=utf-8,' + encodeURI(this.props.block.output);
        return React.createElement('iframe', { src: src, ref: 'iframe', frameBorder: 0, style: { width: '100%' } });
    }
}
module.exports.RenderedHTMLViz = RenderedHTMLViz;

class TextViz extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return React.createElement('div', { style: { margin: 0, lineHeight: 1.38 } }, this.props.block.output);
    }
}
module.exports.TextViz = TextViz;

class TextDiffVizOptions extends React.Component {

    constructor(props) {
        super(props);

        var default_compare_against_block = _.find(this.props.block.depends_on, test_block => _.isString(test_block.output));
        this.state = {
            compare_against_block_name: default_compare_against_block ? default_compare_against_block.name : '',
            show_additions: true,
            show_deletions: true
        };
        this.change_compare_against = this.change_compare_against.bind(this);
        this.change_show_additions = this.change_show_additions.bind(this);
        this.change_show_deletions = this.change_show_deletions.bind(this);
        this.change_name = this.change_name.bind(this);
    }

    change_compare_against(evt) {
        //  hack, should be Event type but EventTarget doesn't always have 'value' property
        this.setState({ compare_against_block_name: evt.target.value || '' });
    }
    change_show_additions(evt) {
        this.setState({ show_additions: !this.state.show_additions });
    }
    change_show_deletions(evt) {
        this.setState({ show_deletions: !this.state.show_deletions });
    }
    componentDidUpdate() {
        this.props.render_visualization(this.props.ui_block, TextDiffViz);
    }
    change_name(old_name, new_name) {
        if (this.state.compare_against_block_name == old_name) {
            this.setState({ compare_against_block_name: new_name });
        }
    }
    render() {
        var option_attributes = { style: { display: 'inline-block' } };
        return React.createElement('div', null, [React.createElement('div', option_attributes, React.createElement('label', null, ' diff against: '), React.createElement('input', { value: this.state.compare_against_block_name, onChange: this.change_compare_against, size: this.state.compare_against_block_name.length || 4, key: 'compare_against' })), React.createElement('div', option_attributes, [React.createElement('input', { type: 'checkbox', checked: this.state.show_additions, onChange: this.change_show_additions, key: 'show_additions' }), React.createElement('label', null, 'show additions')]), React.createElement('div', option_attributes, [React.createElement('input', { type: 'checkbox', checked: this.state.show_deletions, onChange: this.change_show_deletions, key: 'show_deletions' }), React.createElement('label', null, 'show deletions')])]);
    }
}
class TextDiffViz extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {
        var compare_against_block = _.find(this.props.blocks, test_block => test_block.name == this.props.options.compare_against_block_name);
        if (!compare_against_block) {
            throw 'Block with name "' + this.props.options.compare_against_block_name + '" not found';
        }
        var changes = diff.diffChars(compare_against_block.output, this.props.block.output);
        return React.createElement('div', null, changes.map((part, i) => {
            return React.createElement('span', {
                style: {
                    color: part.added && this.props.options.show_additions ? 'green' : part.removed && this.props.options.show_deletions ? 'red' : 'grey',
                    fontWeight: part.added && this.props.options.show_additions ? 'bold' : 'normal',
                    textDecoration: part.removed && this.props.options.show_deletions ? 'line-through' : 'none',
                    // backgroundColor: part.added && this.props.options.show_additions ? '',
                    display: part.added && !this.props.options.show_additions ? 'none' : part.removed && !this.props.options.show_deletions ? 'none' : 'inline'
                },
                key: i
            }, part.value);
        }));
    }
}
TextDiffViz.options = TextDiffVizOptions;
module.exports.TextDiffViz = TextDiffViz;

class RawJSONViz extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return React.createElement('pre', { style: { margin: 0, lineHeight: 1.38 } }, JSON.stringify(this.props.block.output, null, '    '));
    }
}
module.exports.RawJSONViz = RawJSONViz;

class HTMLPickerVizOptions extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            selector: '',
            send_to_block_name: ''
        };
        this.change_selector = this.change_selector.bind(this);
        this.new_block = this.new_block.bind(this);
    }
    componentDidUpdate() {
        this.props.render_visualization(this.props.ui_block, HTMLPickerViz);

        if (this.state.send_to_block_name) {
            var block = _.find(interpreter.blocks, block => block.name == this.state.send_to_block_name);
            interpreter.change_code(block, `'${this.state.selector}'`);
            ui.render_code(block);
        }
    }
    change_selector(evt) {
        var selector = evt.target.value;
        this.setState({ selector: selector });
    }
    new_block(evt) {
        var block = interpreter.create_block('css_selector', `'${this.state.selector}'`);
        this.setState({ send_to_block_name: block.name });
        ui.create_and_render_block(block, this.props.ui_block.row, this.props.ui_block.column + this.props.ui_block.width_in_columns);
    }
    change_name(old_name, new_name) {
        if (old_name === this.state.send_to_block_name) {
            this.setState({ send_to_block_name: new_name });
        }
    }

    render() {
        return React.createElement('div', null, [React.createElement('label', null, 'Selector: '), React.createElement('input', { type: 'search', onChange: this.change_selector, value: this.state.selector }), this.state.send_to_block_name ? React.createElement('span', { style: { color: 'white', backgroundColor: 'black', fontWeight: 'bold', padding: '2px 4px', marginLeft: 10 } }, this.state.send_to_block_name) : React.createElement('button', { onClick: this.new_block }, '->')]);
    }
}
class HTMLPickerViz extends React.Component {

    constructor(props) {
        super(props);
        this.attach_picker_events = this.attach_picker_events.bind(this);
        this.highlight_selector = this.highlight_selector.bind(this);
        this.common_nodes = [];
        this.old_selector = '';
    }
    componentDidMount() {}
    componentDidUpdate(old_props) {
        this.highlight_selector(this.props.options.selector);
        this.common_nodes = [];
        this.old_selector = '';
    }

    highlight_selector(selector) {
        var clear_selector = '.flowsheets_selected';
        if (this.old_selector) {
            clear_selector += ', ' + this.old_selector;
        }

        try {
            this.refs.iframe.contentWindow.$(clear_selector).removeClass('flowsheets_selected').css({
                backgroundColor: 'inherit',
                boxShadow: 'none',
                outline: 'none'
            });
        } catch (e) {}
        this.old_selector = selector;
        try {
            this.refs.iframe.contentWindow.$(selector).addClass('flowsheets_selected').css({
                backgroundColor: 'yellow',
                boxShadow: '0 0 10px rgba(0,0,0,.4)',
                outline: '1px solid yellow'
            });
        } catch (e) {}
    }

    attach_picker_events() {
        // first, make sure jquery is there
        var jquery = document.createElement('script');
        jquery.innerText = fs.readFileSync('node_modules/jquery/dist/jquery.min.js').toString();
        this.refs.iframe.contentWindow.document.body.appendChild(jquery);

        var nodes = [];

        var start_nodes = this.refs.iframe.contentWindow.document.querySelectorAll('body > *');
        for (var i = 0; i < start_nodes.length; ++i) {
            nodes.push(start_nodes[i]);
        }

        var candidate_nodes = [];

        // Basically, get all nodes with at least one text node as a child as a good candidate for a user to choose
        // since users will probably only want to choose nodes with text in them.

        while (nodes.length > 0) {
            var node = nodes.pop();
            if (node.hasChildNodes() && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' && node.tagName !== 'NOSCRIPT') {
                for (var i = 0; i < node.childNodes.length; ++i) {
                    var child_node = node.childNodes[i];
                    // if a node has any children that are text, it's a candidate
                    if (child_node.nodeType == child_node.TEXT_NODE && !child_node.textContent.match(/^\s+$/) || child_node.tagName === 'IMG') {
                        candidate_nodes.push(node);
                    } else {
                        nodes.push(child_node);
                    }
                }
            }
        }

        var classname = 'flowsheets_selected';

        candidate_nodes.forEach(node => {
            $(node).on('mouseenter', evt => {
                var $t = $(evt.target);
                if ($t.hasClass(classname)) return;

                $t.css({ backgroundColor: 'yellow', boxShadow: '0 0 10px rgba(0,0,0,.4)' });
            }).on('mouseleave', evt => {
                var $t = $(evt.target);
                if ($t.hasClass(classname)) return;
                $t.css({ backgroundColor: 'inherit', boxShadow: 'inherit', outline: 'none' });
            }).off('mousedown mouseup click').on('click', evt => {
                evt.preventDefault();
                evt.stopPropagation();
                // make sure it's not already there
                for (var i = 0; i < this.common_nodes.length; ++i) {
                    if (this.common_nodes[i] === evt.target) {
                        return;
                    }
                }

                this.common_nodes.push(evt.target);

                // find closest common ancestor
                var $closestAncestor = $(this.common_nodes[0]).parents();
                this.common_nodes.forEach(node => {
                    var $node = $(node);
                    $closestAncestor = $closestAncestor.has($node);
                });

                // make selector
                var selector = $closestAncestor.prop('tagName').toLowerCase();
                if ($closestAncestor.attr('id')) {
                    selector += '#' + $closestAncestor.attr('id');
                } else if ($closestAncestor.attr('class')) {
                    selector += '.' + $closestAncestor.attr('class').replace(/\s+$/, '').split(/\s+/).join('.');
                }

                selector += ' ';

                selector += this.common_nodes[0].tagName.toLowerCase();
                if (this.common_nodes[0].className) {
                    selector += '.' + this.common_nodes[0].className.replace(/\s+$/, '').split(/\s+/).join('.');
                }

                this.highlight_selector(selector);

                this.props.options_component.setState({ selector: selector });
                var send_selector_to_block = _.find(this.props.blocks, block => block.name === this.props.options_component.state.send_to_block_name);
                if (send_selector_to_block) {
                    interpreter.change_code(send_selector_to_block, `'${selector}'`);
                    ui.render_code(send_selector_to_block);
                }
            });
        });
    }

    render() {
        var src = 'data:text/html;charset=utf-8,' + encodeURI(this.props.block.output);

        return React.createElement('iframe', { src: src, ref: 'iframe', onLoad: this.attach_picker_events, frameBorder: 0, style: { width: '100%' } });
    }
}
HTMLPickerViz.options = HTMLPickerVizOptions;
module.exports.HTMLPickerViz = HTMLPickerViz;

class CustomViz extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        return React.createElement('div', null, this.props.block.output);
    }
}
module.exports.CustomViz = CustomViz;