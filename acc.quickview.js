ACC.quickview = {

	_autoload: [
		"bindToUiCarouselLink",
		"resizeColorboxOnDeviceSizeAndOrientationChnage"
	],
		
	initQuickviewLightbox:function(){
		ACC.product.enableAddToCartButton();
		ACC.product.bindToAddToCartForm();
		ACC.product.enableStorePickupButton();
		ACC.product.bindAddtoQuotePage();
		ACC.product.bindAddtoQuotePageUsh();
	},
		
	refreshScreenReaderBuffer: function ()
	{
		// changes a value in a hidden form field in order
		// to trigger a buffer update in a screen reader
		$('#accesibility_refreshScreenReaderBufferField').attr('value', new Date().getTime());
	},
	
resizeColorboxOnDeviceSizeAndOrientationChnage: function() {
		window.addEventListener("orientationchange", function() {
			$.colorbox.resize();
		}, false);
		window.addEventListener("resize", function() {
			$.colorbox.resize();
		}, false);
	},

	bindToUiCarouselLink: function ()
	{
		var titleHeaderHtml = $('#quickViewTitle').html();
		if($("#quickViewTitleCartRecommendation").length >0){
			titleHeaderHtml = $('#quickViewTitleCartRecommendation').html();
		}
		$(".js-owl-carousel-reference .js-reference-item,.carousel .js-reference-item, .quickViewGrid .js-reference-item").colorbox({
			close:'<span class="glyphicon glyphicon-remove"></span>',
			title: titleHeaderHtml,
			maxWidth: window.innerWidth <=640 ? "100%" : window.innerWidth <=850 ? "95%" : window.innerWidth <=900 ? "90%" : window.innerWidth <=1000 ? "85%": window.innerWidth <=1100 ? "80%" : "70%",
			onComplete: function ()
			{
				ACC.quickview.refreshScreenReaderBuffer();
				ACC.quickview.initQuickviewLightbox();
				ACC.ratingstars.bindRatingStars($(".quick-view-stars"));
				$.colorbox.resize();
				gtmElement = document.getElementById('quickViewGTMData');
				if(gtmElement){
					dataset = gtmElement.dataset;
					if(dataset){
						const variant = dataset.color;
	                	const category = dataset.category;
	                	var rootcategory = dataset.rootcategory;
	                	const name = dataset.name;
	                	const code = dataset.code;
	                	const price = dataset.price;
	                	const fromSearchPage = dataset.search;
	                	if(fromSearchPage == 'true'){
	                		rootcategory="Search";
	                	}
	                	ACC.track.trackPlpQuickViewClick(category, rootcategory, name, code, variant, price);
					}
				}
				$("#quick-view-quantity").on("change paste keyup", function() {
				  if(document.getElementById("quick-view-quantity")) {
		          const qty = document.getElementById("quick-view-quantity").value;
		          $("#pdpAddtoCartInput").val(qty);
		          let addtocartQty = $("#addToCartForm").find(".js-qty-selector-input");
		          let configureQty = $("#configureForm").find(".js-qty-selector-input");  
		          //addtocartQty.val(qty);
		          //configureQty.val(qty);
		
			        // if(document.body.classList.contains("site-ush")) {
			
			             let url = ACC.config.encodedContextPath+document.getElementById("quickview-product-context-url").value+"/volumePriceByQty/"+qty;
			              $.ajax({
			                 type:"GET",
			                 url: url,
			                 success:function(prices) {
			                    $(".quick-view-popup .quick-view-product-price-by-qty").text(prices[0]);

                                if(prices[1])
                                 {
                                     $(".quick-view-popup .product-price-strike-through").text(prices[1]);
                                 }
                                 else{
                                     $(".quick-view-popup .product-price-strike-through").text('');
                                 }
                                 if(prices[2])
                                  {
                                     $(".quick-view-popup .product-price-percentage").text('You save ' +prices[2]+' %');
                                  }
                                  else
                                   {
                                      $(".quick-view-popup .product-price-percentage").text('');
                                   }
			                 },
			                 error:function(e) {
			                      console.log(e);
			                  }
			              });
			        // }
			
			        }
				});
				$( ".quick-view-popup" ).attr( "data-insights-index", $(".quickViewGrid").attr("data-insights-index"));
				$( ".quick-view-popup" ).attr( "data-insights-object-id", $(this).closest(".tile").attr("data-insights-object-id"));
				if($(".quickViewGrid").attr("data-pagetype") === "PRODUCTSEARCH") {
					$( ".quick-view-popup" ).attr( "data-insights-query-id", $(this).closest(".search-product").attr("data-insights-query-id"));
					$( ".quick-view-popup" ).attr( "data-insights-position", $(this).closest(".search-product").attr("data-insights-position"));
				}else {
					$( ".quick-view-popup" ).attr( "data-insights-query-id", $(this).closest(".single-product").attr("data-insights-query-id"));
					$( ".quick-view-popup" ).attr( "data-insights-position", $(this).closest(".single-product").attr("data-insights-position"));
				}
			},

			onClosed: function ()
			{
				ACC.quickview.refreshScreenReaderBuffer();
			}
		});
	}
	
};