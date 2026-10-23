jQuery(document).ready(function() {
    var owlVideobanners = $(".js-htmlbanners3-carousel");
    if (owlVideobanners.data('carousel')){
        owlVideobanners.owlCarousel({
            items: owlVideobanners.data('items'),
            nav: (owlVideobanners.children().length > 1) ? owlVideobanners.data('navigation') : false,
            dots: (owlVideobanners.children().length > owlVideobanners.data('items')) ? owlVideobanners.data('pagination') : false,
            autoplay: owlVideobanners.data('autoplay'),
            autoplayTimeout: owlVideobanners.data('timeout'),
            autoplayHoverPause: owlVideobanners.data('pause'),
            loop: (owlVideobanners.children().length > 1) ? owlVideobanners.data('loop') : false,
            responsiveClass: true,
            responsive:{
                0:{
                    items: owlVideobanners.data('items_480')
                },
                480:{
                    items: owlVideobanners.data('items_768')
                },
                768:{
                    items: owlVideobanners.data('items_991')
                },
                991:{
                    items: owlVideobanners.data('items_1199')
                },
                1199:{
                    items: owlVideobanners.data('items')
                }
            },
            navText: ['<i class="font-left-open-big">','<i class="font-right-open-big">']
        });
    }
});