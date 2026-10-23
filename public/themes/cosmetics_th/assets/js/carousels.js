$(document).ready(function(){
	/*index page*/
	$(".js-carousel-products").each(function(){
		var owlProductsIndex = $(this);
			owlProductsIndex.owlCarousel({
			items: 4,
			nav: false,
			dots: owlProductsIndex.children().length > 1,
			autoplay: true,
			loop: owlProductsIndex.children().length > 1,
			responsiveClass:true,
			responsive:{
				0:{
					items:2
				},
				480:{
					items:2
				},
				768:{
					items:3
				},
				991:{
					items:4
				}
			},
			navText:	['<i class="font-left-open-big">','<i class="font-right-open-big">']
		});
	});
});