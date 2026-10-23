/*
 * 2007-2019 PrestaShop
 *
 * NOTICE OF LICENSE
 *
 * This source file is subject to the Academic Free License (AFL 3.0)
 * that is bundled with this package in the file LICENSE.txt.
 * It is also available through the world-wide-web at this URL:
 * http://opensource.org/licenses/afl-3.0.php
 * If you did not receive a copy of the license and are unable to
 * obtain it through the world-wide-web, please send an email
 * to license@prestashop.com so we can send you a copy immediately.
 *
 * DISCLAIMER
 *
 * Do not edit or add to this file if you wish to upgrade PrestaShop to newer
 * versions in the future. If you wish to customize PrestaShop for your
 * needs please refer to http://www.prestashop.com for more information.
 *
 *  @author PrestaShop SA <contact@prestashop.com>
 *  @copyright  2007-2019 PrestaShop SA
 *  @license    http://opensource.org/licenses/afl-3.0.php  Academic Free License (AFL 3.0)
 *  International Registered Trademark & Property of PrestaShop SA
 */

$(document).ready(function() {
    thumbnailsGallery();
});
function thumbnailsGallery() {
    $('.product-cover div').off().show().removeAttr('data-toggle').removeAttr('data-target');
    $('.product-cover div').click(function () {
        var imgs_fancyslder_pic = [];
        var cover_img = $('.product-cover img').attr('src');
         $('.thumb-container img').each(function (i) {
             if (cover_img != $(this).attr('data-image-large-src')) {
                 imgs_fancyslder_pic.push({
                     type: 'image',
                     autoScale: true,
                     href: $(this).attr('data-image-large-src'),
                     title: $(this).attr('title')
                 });
             }
         });
        imgs_fancyslder_pic.unshift({
            type: 'image',
            autoScale: true,
            href: $('.product-cover img').attr('src'),
            title: $('.product-cover img').attr('title')
        });

        $.fancybox.open(imgs_fancyslder_pic, {
            padding: 0
        });
    });

    $('.thumb-container img').click(function () {
        var imgs_fancyslder_pic = [];
        var clicked_img = $(this).attr('data-image-large-src');
        imgs_fancyslder_pic.unshift({
            type: 'image',
            autoScale: true,
            href: $(this).attr('data-image-large-src'),
            title: $(this).attr('title')
        });
        $('.thumb-container img').each(function (i) {
            if (clicked_img != $(this).attr('data-image-large-src')) {
                imgs_fancyslder_pic.push({
                    type: 'image',
                    autoScale: true,
                    href: $(this).attr('data-image-large-src'),
                    title: $(this).attr('title')
                });
                $(this).attr('data-index-img', i);
            }
        });
        $.fancybox.open(imgs_fancyslder_pic, {
            padding: 0
        });
    });
};