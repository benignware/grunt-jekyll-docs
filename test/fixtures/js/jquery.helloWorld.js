(function($, window) {

  var $window = $(window);
  var pluginName = 'helloWorld';
  
  var defaults = {
  };
  
  function HelloWorld(element, options) {
    var $element = $(element);
    console.log("init example plugin", element, options);
    $element.on('click', function() {
      alert($element.text());
    });
  }
  
  var pluginClass = HelloWorld;

  // register plugin
  $.fn[pluginName] = function(options) {
    return this.each(function() {
      if (!$(this).data(pluginName)) {
        $(this).data(pluginName, new pluginClass(this, $.extend({}, defaults, options)));
      }
      return $(this);
    });
  };
  
  
})(jQuery, window);
