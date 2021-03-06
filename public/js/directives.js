'use strict';

/* Directives */

// on-focus and on-blur. 
// borrows a lot from: angular/src/ng/directive/ngEventDirs.js
var onEventDirectives = {};
angular.forEach(
	'Focus Blur'.split(' '),
	function(name) {
		var directiveName = 'on' + name;
		onEventDirectives[directiveName] = ['$parse', function($parse) {
			return function(scope, element, attr) {
				var fn = $parse(attr[directiveName]);
				element.bind(angular.lowercase(name), function(event) {
					fn(scope, {$event:event});
				});
			};
		}];
	}
);

angular.module('notes.directives', []).
directive('appVersion', function (version) {
	return function(scope, elm, attrs) {
		elm.text(version);
	};
})
.directive("onFocus", onEventDirectives["onFocus"])
.directive("onBlur", onEventDirectives["onBlur"])
.directive("focusHook", [
function() {
	// We can make something like <input focus-hook="me"/>
	// and set $scope.me to true, and this will focus
	// the input element.
	return function($scope, $el, attrs) {
		$scope.$watch(attrs.focusHook, function (val) {
			if (val) {
				var focus = function() {
					$el[0].focus();
				}
				setTimeout(focus, 0);
			}
		}, true);
	};
}])
.directive("aceEditor", [
function () {

	// Define a mode for us to use, with some text-highlighting rules
	// for finding URLs.
	//
	// Ace doc on how to define a mode: 
	// https://github.com/ajaxorg/ace/wiki/Creating-or-Extending-an-Edit-Mode
	ace.define('ace/mode/notes', function (require, exports, module) {

		var oop = ace.require("ace/lib/oop");
		var TextMode = ace.require("ace/mode/text").Mode;
		var Tokenizer = ace.require("ace/tokenizer").Tokenizer;
		var NotesHighlightRules = ace.require("ace/mode/notes_highlight_rules").NotesHighlightRules;

		var Mode = function() {
			this.$tokenizer = new Tokenizer(new NotesHighlightRules().getRules());
		};
		oop.inherits(Mode, TextMode);

		(function() {
			// Extra logic goes here.
		}).call(Mode.prototype);

		exports.Mode = Mode;
	});

	ace.define('ace/mode/notes_highlight_rules', function (require, exports, module) {

		var oop = ace.require("ace/lib/oop");
		var TextHighlightRules = ace.require("ace/mode/text_highlight_rules").TextHighlightRules;

		var NotesHighlightRules = function() {
			// We got this regex from Matthew O'Riordan, here:
			// http://mattheworiordan.tumblr.com/post/13174566389/url-regular-expression-for-links-with-or-without-the
			this.$rules = {
				"start" : [
					{
						token: "url", 
						regex: /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-]*)?\??(?:[\-\+=&;%@\.\w]*)#?(?:[\.\!\/\\\w]*))?)/
					},
					{
						// Note urls start with /
						token: "note-url",
						regex: /\/[^\/ ][\w.%+\-\/]*/
					},
					{
						caseInsensitive: true
					}
				]
			};
		}

		oop.inherits(NotesHighlightRules, TextHighlightRules);
		exports.NotesHighlightRules = NotesHighlightRules;
	});

	return {
	  restrict: "EA",
	  require: "ngModel",
	  replace: true,
	  template: "<div id=\"notes-ace-editor\" class=\"ace-container\"></div>",

	  link: function($scope, $el, attrs, model) {
		var editor, session, updateViewValue;
		
		editor = ace.edit("notes-ace-editor");
		// We instantiate with ace.edit instead of the Editor object
		// because for some reason that causes undo and redo to stop working.
		// editor = new Editor(new Renderer($el[0], "ace/theme/textmate"));

		editor.setHighlightActiveLine(false);

		var renderer = editor.renderer;
		renderer.setTheme("ace/theme/textmate");
		renderer.setShowGutter(false);
		renderer.setShowPrintMargin(false);

		session = editor.getSession();
		session.setUseWrapMode(true);
		session.setMode('ace/mode/notes');

		// The Ace editor prevents the default click actions from occurring, 
		// so we have to actively handle them, here.
		editor.on("click", function (e) {
			var position = e.getDocumentPosition();
			var token = session.getTokenAt(position.row, position.column);
			var line = session.doc.getLine(position.row);

			// If this is the last column in a row, do not navigate,
			// because we get in this situation when we click on the
			// far-right side of a line, even though we are not really
			// hovering over a url token.
			//
			// This has a side effect in that if the right half of the 
			// last letter is clicked, we will not navigate, when we
			// should.
			if (position.column === line.length) {
				return;
			}
			
			// Tell our controller that someone clicked a url.
			if (token && token.type === "url") {
				$scope.webUrlClicked(token.value);
			}
			if (token && token.type === "note-url") {
				// Not sure if $apply should be here or in the parent
				// controller, but if it's not somewhere then 
				// changes to $location.path won't take effect until
				// some other event has fired.
				$scope.$apply($scope.noteUrlClicked(token.value));
			}
		});


		$scope.resizeEditor = function () {
			// Tell the Ace editor that it should adjust
			// its size to fit our new window size.
			editor.resize();
		};

		$scope.focusEditor = function () {
			editor.focus();
		};

		// This is so we can move the cursor after some
		// content is loaded.
		var initialized = false;
		var initEditor = function () {
			// Move the cursor to the end of the first line,
			// because it looks better.
			if (!initialized) {
				// HACK: I tried for a couple of hours to listen to 
				// the right chain of events for the cursor to move 
				// after some text is loaded. This is a hobby project,
				// and setTimeout makes everything better, so let's
				// just go with that for now.
				setTimeout(function() {
					editor.navigateLineEnd();
					initialized = true;
				}, 0);
			}
		};

		model.$render = function() {
			return session.setValue(model.$modelValue);
		};

		var updateViewValue = function (e) {
			if (!$scope.$$phase) {
				return $scope.$apply(function() {
					return model.$setViewValue(session.getValue());
				});
			};
		};

		// Take the focus / cursor on page load.
		$scope.focusEditor();

		// Watch our document for changes. When we see some
		// text has been loaded for the first time, call
		// our initEditor function.
		session.getDocument().on("change", function () {
			var doc = session.getDocument();
			var lineCount = doc.getLength();
			if (lineCount === 1) {
				var firstLine =  doc.getLine(0);
				if (firstLine.length > 0) {
					initEditor();
				}
			}
			else {
				initEditor();
			}
		});

		session.on("change", updateViewValue);
		return $scope.$on("$destroy", function() {
			return editor.removeListener("change", updateViewValue);
		});
	  }
	};
  }
]);
;
