const _ = require('underscore');
const React = require('react');
const $ = require('jquery');

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
        if (_.isArray(this.props.output) || _.isObject(this.props.output)) {
            var outputElement = [];
            var i = 0;
            _.each(this.props.output, (item, index, output) => {
                if (i >= this.props.output_height) {
                    return;
                }
                if (_.isArray(this.props.output)) {
                    outputElement.push(React.createElement('input', { value: item, key: item }));
                } else {
                    outputElement.push(React.createElement('input', { value: '' + index + ': ' + item }));
                }
                i += 1;
            });
        } else {
            var outputElement = React.createElement('input', { value: this.props.output });
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
        return React.createElement('div', { dangerouslySetInnerHTML: { __html: this.props.output } });
    }
}
module.exports.HTMLViz = HTMLViz;