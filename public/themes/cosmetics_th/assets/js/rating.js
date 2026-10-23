$(document).ready(function(){
	if ($('.product-list-reviews').length !=0) {
		fillRating();
	}
});
//fill rating stars in product list
function fillRating() {
    $('.product-list-reviews').each(function() {
        const $ = jQuery;
        const productId = $(this).data('product-id');
        const productReview = $('.product-list-reviews-' + productId);
        const productCommentGradeUrl = $(this).data('comment-grade');
        $.get(productCommentGradeUrl, { id_product: productId }, function(jsonResponse) {
            var jsonData = false;
            try {
                jsonData = JSON.parse(jsonResponse);
            } catch (e) {}

            if (jsonData) {
                if (jsonData.id_product && jsonData.comments_nb) {
                    $('.grade-stars', productReview).rating({ grade: jsonData.average_grade, starWidth: 18 });
                    $('.comments-nb', productReview).html('(' + jsonData.comments_nb + ')');
                    productReview.closest('.thumbnail-container').addClass('has-reviews');
                    //productReview.css('opacity', '1');
                }
            }
        });
    });
}
