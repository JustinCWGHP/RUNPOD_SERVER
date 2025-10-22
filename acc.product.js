ACC.product = {

	_autoload: [
		"bindToAddToCartForm",
		"bindAddtoQuotePage",
		"bindAddtoQuotePageUsh",
		"enableStorePickupButton",
		"enableVariantSelectors",
		"bindFacets",
		"bindQuantityValidation"
	],


	bindFacets: function() {
		$(document).on("click", ".js-show-facets", function(e) {
			e.preventDefault();
			var selectRefinementsTitle = $(this).data("selectRefinementsTitle");
			var colorBoxTitleHtml = ACC.common.encodeHtml(selectRefinementsTitle);
			ACC.colorbox.open(colorBoxTitleHtml, {
				href: ".js-product-facet",
				inline: true,
				width: "520px",
				onComplete: function() {
					$(document).on("click", ".js-product-facet .js-facet-name", function(e) {
						e.preventDefault();
						$(".js-product-facet  .js-facet").removeClass("active");
						$(this).parents(".js-facet").addClass("active");
						$.colorbox.resize()
					})
				},
				onClosed: function() {
					$(document).off("click", ".js-product-facet .js-facet-name");
				}
			});
		});
		enquire.register("screen and (min-width:" + screenSmMax + ")", function() {
			$("#cboxClose").click();
		});
	},


	enableAddToCartButton: function() {
		$('.js-enable-btn').each(function() {
			if (!($(this).hasClass('outOfStock') || $(this).hasClass('out-of-stock'))) {
				$(this).prop("disabled", false);
			}
		});
	},

	enableVariantSelectors: function() {
		$('.variant-select').prop("disabled", false);
	},

	bindToAddToCartForm: function() {
		var addToCartForm = $('.add_to_cart_form');
		addToCartForm.ajaxForm({
			//beforeSubmit:ACC.product.showRequest,
			beforeSubmit: ACC.product.validateQuantity,
			success: ACC.product.displayAddToCartPopup
		})
		if (addToCartForm.length > 0) {
			let input = addToCartForm.find("input[name='qty']");
			// Add event listener
			if (input.length > 0) {
				input.on("input", function(e) {
					// Clear any old status
					this.setCustomValidity("");
					$(this).on('keypress', function(e) {
						var maxLength = $(this).val().length;
						if (document.body.classList.contains("site-ush")) {
							if (maxLength >= 5) {
								return false;
							}
						}else
						{
							if (maxLength >= 6) {
								return false;
							}
						}
					});

					if (!this.validity.valid) {
						let step = $(this).attr("step");
						let min = $(this).attr("min");
						this.setCustomValidity("Value must be greater than or equal to " + min + ", and in multiples of " + step);
					}
				});
			}
		}
		/*
	   setTimeout(function(){
		   $ajaxCallEvent  = true;
		}, 2000);
		*/
	},
	bindQuantityValidation: function() {
		// Get DOM reference
		if ($('form[name="addToCartDisplayForm"]').length > 0) {
			let input = $('form[name="addToCartDisplayForm"]').find("input[id='quantity']");
			// Add event listener
			if (input.length > 0) {
				input.on("input", function(e) {
					// Clear any old status
					this.setCustomValidity("");

					if (!this.validity.valid) {
						let step = $(this).attr("step");
						let min = $(this).attr("min");
						this.setCustomValidity("Value must be greater than or equal to " + min + ", and in multiples of " + step);
					}
				});
			}
		}
		if ($('form[class="add_to_cart_form"]').length > 0) {
			let input = $('form[class="add_to_cart_form"]').find("input[name='qty']");
			// Add event listener
			if (input.length > 0) {
				input.on("input", function(e) {
					// Clear any old status
					this.setCustomValidity("");

					if (!this.validity.valid) {
						let step = $(this).attr("step");
						let min = $(this).attr("min");
						this.setCustomValidity("Value must be greater than or equal to " + min + ", and in multiples of " + step);
					}
				});
			}
		}
	},
	validateQuantity: function(arr, $form, options) {
		if ($('form[name="addToCartDisplayForm"]').length > 0) {
			return $('form[name="addToCartDisplayForm"]').get(0).reportValidity();
		} else {
			return true;
		}
	},
	showRequest: function(arr, $form, options) {
		if ($ajaxCallEvent) {
			$ajaxCallEvent = false;
			return true;
		}
		return false;
	},
	bindAddtoQuotePage: function() {
		if ($(".js-addtoquote-button").length != 0) {
			$(".js-addtoquote-button").click(function(e) {
				e.preventDefault();
				const productCode = document.getElementById("js-product-code") ? document.getElementById("js-product-code").dataset.productcode : null;
				const quantity = document.getElementById("quick-view-quantity") ? document.getElementById("quick-view-quantity").value : document.getElementById("quantity") ? document.getElementById("quantity").value : 0;
				var urlRequestQuote = ACC.config.encodedContextPath + '/accountdashboard/my-account/my-quotes/quote-requests';
				window.location = urlRequestQuote;
				localStorage.setItem('_productCode_', productCode);
				localStorage.setItem('_productQuantity_', quantity);
			});
		}
	},
	bindAddtoQuotePageUsh: function() {
		if ($(".js-addtoquote-ush").length != 0) {
			$(".js-addtoquote-ush").click(function(e) {
				e.preventDefault();
				ACC.CRLMyAccountDashboard.displayCrlPageLoader();
				const productCode = document.getElementById("js-product-code") ? document.getElementById("js-product-code").dataset.productcode : null;
				const quantity = document.getElementById("quantity") ? document.getElementById("quantity").value : null;
				var urlRequestQuote = ACC.config.encodedContextPath + '/quote/product/validate';

				var method = "GET";

				$.ajax({
					url: urlRequestQuote,
					data: { productCode: productCode, quantity: quantity },
					type: method,
					dataType: "text",
					success: function(data) {
					ACC.CRLMyAccountDashboard.hideCrlPageLoader();
					window.location = ACC.config.encodedContextPath + '/cart';
					},
					error: function(xht, textStatus, ex) {
						ACC.CRLMyAccountDashboard.hideCrlPageLoader();
						console.error("Failed to create quote for product %s", productCode);
            			document.location.reload();
					}

				});

			});
		}
	},

	bindToAddToCartStorePickUpForm: function() {
		var addToCartStorePickUpForm = $('#colorbox #add_to_cart_storepickup_form');
		addToCartStorePickUpForm.ajaxForm({ success: ACC.product.displayAddToCartPopup });
	},

	enableStorePickupButton: function() {
		$('.js-pickup-in-store-button').prop("disabled", false);
	},

	addToCartToSendToGTM: function(cartResult, statusText, xhr, formElement) {
		var pageTypeForAddToCart;
		var productCode = $('[name=productCodePost]', formElement).val();
		var quantityField = $('[name=qty]', formElement).val();
		var quantity = 1;
		if (quantityField != undefined) {
			quantity = quantityField;
		}

		var combiningEventsBasedOnQOListCart = [];
		$('.js-ul-container .js-li-container, .cart-page-sku-ul .js-li-container').each(function(){
			if($(this).children(":first").attr('data-insights-object-id') || 
			$(this).children(":first").attr('data-insights-query-id') || $(this).children(":first").attr('data-insights-position')) {
				combiningEventsBasedOnQOListCart.push({data_insights_index: 
					($(".item__list__cart").attr("data-insights-index") ? 
					$(".item__list__cart").attr("data-insights-index") : 
					$(".js-quick-order-container").attr("data-insights-index")), 
				data_insights_object_id: $(this).children(":first").attr('data-insights-object-id'),
				data_insights_query_id: $(this).children(":first").attr('data-insights-query-id'), 
				data_insights_position: $(this).children(":first").attr('data-insights-position')} 
			);
			}
		});
		algoliaAtributeGTM = combiningEventsBasedOnQOListCart;

		var cartData;

		var cartAnalyticsData = cartResult.cartAnalyticsData;
		if(cartAnalyticsData &&  Array.isArray(cartAnalyticsData) && cartAnalyticsData.length) {
			cartAnalyticsData.forEach(function(item, index, cartArr) {
				cartArr[index]['addtocartLocation']  =  "cart";
				cartArr[index]['algoliaIndexName']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_index'] 
				? algoliaAtributeGTM[index]['data_insights_index'] : null;
				cartArr[index]['algoliaObjectIDs']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_object_id'] 
				? algoliaAtributeGTM[index]['data_insights_object_id'] : null;
				cartArr[index]['algoliaQueryId']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_query_id'] ? 
				algoliaAtributeGTM[index]['data_insights_query_id'] : null;
				cartArr[index]['algoliaPosition']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_position'] 
				? algoliaAtributeGTM[index]['data_insights_position'] : null;
			});
			cartData = cartAnalyticsData;
		}else {
			var cartData = {
				"cartCode": cartAnalyticsData.cartCode,
				"productCode": productCode, "quantity": quantity,
				"productPrice": cartAnalyticsData.productPostPrice,
				"productName": cartAnalyticsData.productName,
				"productVariant": cartAnalyticsData.productVariant,
				"productCategory": cartAnalyticsData.productCategory,
				"addtocartLocation": "cart",
				"algoliaIndexName": algoliaAtributeGTM['data_insights_index'] ? 
				algoliaAtributeGTM['data_insights_index'] : null,
				"algoliaObjectIDs": algoliaAtributeGTM['data_insights_object_id'] ? 
				algoliaAtributeGTM['data_insights_object_id'] : null,
				"algoliaQueryId":  algoliaAtributeGTM['data_insights_query_id'] ? 
				algoliaAtributeGTM['data_insights_query_id'] : null,
				"algoliaPosition": algoliaAtributeGTM['data_insights_position'] ? 
				algoliaAtributeGTM['data_insights_position'] : null
			};
		}

		
		ACC.track.trackAddToCart(productCode, quantity, cartData);

	
	},

	displayAddToCartPopup: function(cartResult, statusText, xhr, formElement) {
		var pageTypeForAddToCart;
		var algoliaAtributeGTM;
	
		//$ajaxCallEvent=true;
		$('#addToCartLayer').remove();
		if (typeof ACC.minicart.updateMiniCartDisplay == 'function') {
			
			ACC.minicart.updateMiniCartDisplay();
		}
		var titleHeader = $('#addToCartTitle').html() ? $('#addToCartTitle').html() : 'Added to Your Shopping Cart';
		if (!cartResult.success) {
			titleHeader = "Important";
		}
		//for algolia event to capture add to cart event data-insights-index=""
		if($(".js-quick-order-container")[0]) {
			pageTypeForAddToCart = "quick-order";
			//for quick order
			var combiningEventsBasedOnQOList = [];
			$('.js-ul-container .js-li-container').each(function(){
				if($(this).children(":first").attr('data-insights-object-id') || 
				$(this).children(":first").attr('data-insights-query-id') || $(this).children(":first").attr('data-insights-position')) {
					combiningEventsBasedOnQOList.push({data_insights_index: $(".js-quick-order-container").attr("data-insights-index"), 
					data_insights_object_id: $(this).children(":first").attr('data-insights-object-id'),
					data_insights_query_id: $(this).children(":first").attr('data-insights-query-id'), 
					data_insights_position: $(this).children(":first").attr('data-insights-position')} 
				);
				}
			});
			algoliaAtributeGTM = combiningEventsBasedOnQOList;
			var cartLayer = cartResult.addToCartLayer;
			const htmlElement = document.createElement('root'); // name does NOT matter
			htmlElement.insertAdjacentHTML('beforeend', cartLayer);
			[...htmlElement.querySelectorAll('div.add-to-cart-item')].map((htmlElement, index) => {
				htmlElement.setAttribute("data-insights-object-id", combiningEventsBasedOnQOList[index]['data_insights_object_id']);
				htmlElement.setAttribute("data-insights-query-id", combiningEventsBasedOnQOList[index]['data_insights_query_id']);
				htmlElement.setAttribute("data-insights-position", combiningEventsBasedOnQOList[index]['data_insights_position']);
			});
			
			ACC.colorbox.open(titleHeader, {
				html: htmlElement,
				width: "460px"
			});
			var data_insights_index_quickorder = $(".js-quick-order-container").attr("data-insights-index");
			$( "#addToCartLayer" ).attr( "data-insights-index", data_insights_index_quickorder);
	
		}else if($(".quick-view-popup")[0]) {
			var quickviewLocation = $(".quickViewGrid").attr("data-pagetype");
			if(quickviewLocation) {
				if(quickviewLocation === "PRODUCTSEARCH"){
					qvLoc =  "srp|";
				}else if(quickviewLocation === "PRODUCTLIST") {
					qvLoc =  "plp|";
				}
				
			}else {
				qvLoc = "";
			}
			
			pageTypeForAddToCart = qvLoc + "quick-view";

			algoliaAtributeGTM = 
			{'data_insights_index' : $(".quick-view-popup").attr("data-insights-index"), 
			'data_insights_object_id' : $(".quick-view-popup").attr("data-insights-object-id"), 
			'data_insights_query_id' : $(".quick-view-popup").attr("data-insights-query-id") ,
			'data_insights_position': $(".quick-view-popup").attr("data-insights-position") };


			ACC.colorbox.open(titleHeader, {
				html: cartResult.addToCartLayer,
				width: "460px"
			});

		}else if($(".pd__infospace")[0]) {
			var pdpLocation = $(".pd__infospace__maininfo__title__productTitle").attr("data-location");
			var pdpLoc;
			if(pdpLocation) {
				pdpLoc = pdpLocation;
			}else {
				pdpLoc = "pdp";
			}
			pageTypeForAddToCart = pdpLoc;
			//for pdp
			
			const data_insights_index = $('.pd__infospace').attr('data-insights-index');
			const data_insights_object_id = $('.pd__infospace__maininfo__title__productTitle').attr('data-insights-object-id');
			const data_insights_query_id = $('.pd__infospace__maininfo__title__productTitle').attr('data-insights-query-id');
			const data_insights_position = $('.pd__infospace__maininfo__title__productTitle').attr('data-insights-position');
			ACC.colorbox.open(titleHeader, {
				html: cartResult.addToCartLayer,
				width: "460px"
			});
			$( "#addToCartLayer" ).attr( "data-insights-index", data_insights_index);
			$( "#addToCartLayer" ).attr( "data-insights-object-id", data_insights_object_id);
			$( "#addToCartLayer" ).attr( "data-insights-query-id", data_insights_query_id);
			$( "#addToCartLayer" ).attr( "data-insights-position", data_insights_position);

			algoliaAtributeGTM = {'data_insights_index' : data_insights_index, 
			'data_insights_object_id' : data_insights_object_id, 
			'data_insights_query_id' : data_insights_query_id ,
			'data_insights_position': data_insights_position };
			

		}else {
			pageTypeForAddToCart = "cart";
			ACC.colorbox.open(titleHeader, {
				html: cartResult.addToCartLayer,
				width: "460px"
			});
		}

		var productCode = $('[name=productCodePost]', formElement).val();
		var quantityField = $('[name=qty]', formElement).val();
		var quantity = 1;
		if (quantityField != undefined) {
			quantity = quantityField;
		}
		var cartData;

		var cartAnalyticsData = cartResult.cartAnalyticsData;
		if(cartAnalyticsData &&  Array.isArray(cartAnalyticsData) && cartAnalyticsData.length) {
			cartAnalyticsData.forEach(function(item, index, cartArr) {
				cartArr[index]['addtocartLocation']  =  pageTypeForAddToCart;
				cartArr[index]['algoliaIndexName']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_index'] 
				? algoliaAtributeGTM[index]['data_insights_index'] : null;
				cartArr[index]['algoliaObjectIDs']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_object_id'] 
				? algoliaAtributeGTM[index]['data_insights_object_id'] : null;
				cartArr[index]['algoliaQueryId']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_query_id'] ? 
				algoliaAtributeGTM[index]['data_insights_query_id'] : null;
				cartArr[index]['algoliaPosition']  =  algoliaAtributeGTM && algoliaAtributeGTM.length && 
				algoliaAtributeGTM[index]['data_insights_position'] 
				? algoliaAtributeGTM[index]['data_insights_position'] : null;
			});
			cartData = cartAnalyticsData;
		}else {
			cartData = {
				"cartCode": cartAnalyticsData.cartCode,
				"productCode": productCode, "quantity": quantity,
				"productPrice": cartAnalyticsData.productPostPrice,
				"productName": cartAnalyticsData.productName,
				"productVariant": cartAnalyticsData.productVariant,
				"productCategory": cartAnalyticsData.productCategory,
				"addtocartLocation": pageTypeForAddToCart,
				"algoliaIndexName": algoliaAtributeGTM['data_insights_index'] ? 
				algoliaAtributeGTM['data_insights_index'] : null,
				"algoliaObjectIDs": algoliaAtributeGTM['data_insights_object_id'] ? 
				algoliaAtributeGTM['data_insights_object_id'] : null,
				"algoliaQueryId":  algoliaAtributeGTM['data_insights_query_id'] ? 
				algoliaAtributeGTM['data_insights_query_id'] : null,
				"algoliaPosition": algoliaAtributeGTM['data_insights_position'] ? 
				algoliaAtributeGTM['data_insights_position'] : null
			};
		}
		ACC.track.trackAddToCart(productCode, quantity, cartData);

	}
};

$(document).ready(function() {
	//$ajaxCallEvent = true;
	ACC.product.enableAddToCartButton();

	$(".quotetoOrder").click(function() {
		/*$("#myModal").modal('show');*/
		quoteToOrderPopUp();

	});

	$("#cancelQuoteBtn").click(function() {
		/*$("#myModal").modal('hide'); */
		$("#colorbox").modal('hide');
		ACC.colorbox.close();
	});

	$(".saveQuotesubmite").click(function() {
		/*$("#myModal").modal('hide');*/
		window.location = $("#cancelQuotesubmite").val();
	});
});

function quoteToOrderPopUp() {
	var popupTitle = "Quote To Order Converter";
	var className = "quote-to-order-popup"
	var href = "#myQuoteToOrderModal";
	var popupTitle = popupTitle;
	ACC.colorbox.open(popupTitle, {
		inline: true,
		className: className,
		href: href,
		width: '572px',

		onComplete: function() {
			$(this).colorbox.resize();
		}
	});
}
