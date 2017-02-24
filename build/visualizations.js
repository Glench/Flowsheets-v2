const _ = require('underscore');
const React = require('react');
const $ = require('jquery');
const diff = require('diff');

const cell_height = require('./renderer').cell_height;

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
    }

    componentDidMount() {
        this.flash_yellow();
    }

    componentDidUpdate(prevProps, prevState) {
        this.flash_yellow();
    }

    flash_yellow() {
        var $inputs = $(this.refs.container).find('input');
        fade_background_color($inputs, 1, 'rgba(255,255,0, ');
    }

    render() {
        if (_.isArray(this.props.block.output) || _.isObject(this.props.block.output)) {
            var outputElement = [];
            var i = 0;
            _.each(this.props.block.output, (item, index, output) => {
                if (i >= this.props.ui_block.output_height) {
                    return;
                }
                if (_.isArray(this.props.block.output)) {
                    outputElement.push(React.createElement('input', { value: item, key: `${index}-${item}` }));
                } else {
                    outputElement.push(React.createElement('input', { value: '' + index + ': ' + item }));
                }
                i += 1;
            });

            var text = 'Length: ' + _.size(this.props.block.output);
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
                } }, text));
        } else {
            var outputElement = React.createElement('input', { value: this.props.block.output });
        }
        return React.createElement('div', { ref: 'container' }, outputElement);
    }
}
module.exports.DefaultViz = DefaultViz;

class HTMLViz extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return React.createElement('div', { dangerouslySetInnerHTML: { __html: this.props.block.output } });
    }
}
module.exports.HTMLViz = HTMLViz;

class TextDiffViz extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        var first_string_block = _.find(this.props.block.depends_on, test_block => _.isString(test_block.output));
        if (!first_string_block) {
            return React.createElement('div', null, this.props.block.output);
        }

        var changes = diff.diffChars(first_string_block.output, this.props.block.output);
        return React.createElement('div', null, changes.map((part, i) => {
            return React.createElement('span', {
                style: {
                    color: part.added ? 'green' : part.removed ? 'red' : 'grey',
                    fontWeight: part.added ? 'bold' : 'normal',
                    textDecoration: part.removed ? 'line-through' : 'none'
                },
                key: i
            }, part.value);
        }));
    }
}
module.exports.TextDiffViz = TextDiffViz;

class RawJSONViz extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return React.createElement('pre', { style: { margin: 0, lineHeight: 1.38 } }, JSON.stringify(this.props.block.output, null, '    '));
    }
}module.exports.RawJSONViz = RawJSONViz;