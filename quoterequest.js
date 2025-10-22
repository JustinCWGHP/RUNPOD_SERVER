productNumberErrorMsg = getCurrentLang().includes('en') ? 'Please enter a valid item number': `Veuillez saisir un numéro d'article valide.` ;
submitError =  getCurrentLang().includes('en') ? 'Please add an item in order to submit your quote request' : 'Veuillez ajouter un article afin de soumettre votre demande de devis.';
function populateAccountDetails(){
		$(".js-rq-deliveryaddress").on("click", function (e) {
			var checkBox = document.getElementById("js-rq-deliveryaddress");
			if (checkBox.checked == true){
				let url = `${ACC.config.encodedContextPath}/accountdashboard/my-account/my-quotes/getdefaultBillingAddress`;
                $.ajax({
                type:"GET",
                url: url,
	                success:function(data) {
						ACC.address.setDefaultAddressId(data.id);					
						if(data.companyName) document.getElementById("js-rq-companyName").value = data.companyName;	
						if(data.firstName) document.getElementById("js-rq-contactName").value = data.firstName;					
						if(data.line1) document.getElementById("js-rq-addressLine1").value = data.line1;
						if(data.line2) document.getElementById("js-rq-addressLine2").value = data.line2;
						if(data.town) document.getElementById("js-rq-city").value = data.town;
						if(undefined != data.country){
							if(data.country.isocode) document.getElementById("js-rq-country").value = data.country.isocode;
							if(undefined != data.region){
								ACC.PurchaserRegisterPage.lodadPurchaserRegions("#js-rq-country","#js-rq-state",data.region.name);
								
								//if(data.region.isocode) document.getElementById("js-rq-state").value = data.region.isocode.substr(3, 4);
							}else{
								ACC.PurchaserRegisterPage.lodadPurchaserRegions("#js-rq-country","#js-rq-state","");
								
							}
						}
						
						if(data.postalCode) document.getElementById("js-rq-zipCode").value = data.postalCode;
						if(data.phone) document.getElementById("js-rq-phoneNumber").value = data.phone;
						const fieldMap = {
							"js-rq-companyName": data.companyName,
							"js-rq-contactName": data.firstName,
							"js-rq-addressLine1": data.line1,
							"js-rq-addressLine2": data.line2,
							"js-rq-city": data.town,
							"js-rq-zipCode": data.postalCode,
							"js-rq-phoneNumber": data.phone
						};

						Object.entries(fieldMap).forEach(([id, value]) => {
							if (value) {
							const el = document.getElementById(id);
							if (el) {
								el.value = value;
								removeFieldError(id);
							}
							}
						});
						if (data.country?.isocode) {
							const countryEl = document.getElementById("js-rq-country");
							if (countryEl) {
								countryEl.value = data.country.isocode;
								removeFieldError("js-rq-country");
							}
							const stateEl = document.getElementById("js-rq-country");
							if (stateEl) {
								stateEl.value = data.country.isocode;
								removeFieldError("js-rq-state");
							}
						}
	                },
	                error:function(e) {
	                    console.log('error: ',e);
	                }
				});
			}else{
					document.getElementById("js-rq-companyName").value = '';	
					document.getElementById("js-rq-contactName").value = '';	
					document.getElementById("js-rq-addressLine1").value = '';		
					document.getElementById("js-rq-addressLine2").value = '';		
					document.getElementById("js-rq-city").value = '';		
					document.getElementById("js-rq-state").value = '';
					document.getElementById("js-rq-country").value = '';
					document.getElementById("js-rq-zipCode").value = '';		
					document.getElementById("js-rq-phoneNumber").value = '';		
			}
		});
}	
function removeFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  if (input) {
    input.style.border = "";
    const errorLabel = input.parentElement.querySelector(".quote-error-message");
    if (errorLabel) errorLabel.remove();
  }
}
function removeQuoteItem(quoteItemId) {
	$("#"+quoteItemId).fadeOut( 250, function() {
        $("#"+quoteItemId).remove();
        var tableHeader = document.getElementById("add-quote-header");
        var rowCount = tableHeader.rows.length;
        if(rowCount == 1){
        	$(".current-quotes").addClass('hidden')
        }
    });
}

function displaySavedQuoteUI(quoteId){
	$(".js-submitquote").off("click");
	$(".js-submitquote").on("click", function (e) {
		var urlAllProducts = ACC.config.encodedContextPath +'/allproducts';
        window.location= urlAllProducts;
	});

	$(".js-rq-confirmui").each(function () {
		$(this).remove();		
	});
	if(ifSiteIsUSH){
		$(".js-submitquote").html('CONTINUE SHOPPING');
		$('#js-quote-submited-message span').text(`The Quote ${quoteId} has been created.`);
		$(".js-rq-title").html('QUOTE SUBMITTED');
		}
		else{
		    var quoteText=$('#quoteText').val();
			var quoteCreated= $('#quoteCreatedMsg').val();
			var quoteId=  quoteId;
		$(".js-submitquote").html($('#quoteContinueShipping').val());
		$('#js-quote-submited-message span').text( quoteText +" "+quoteId+" "+quoteCreated);$(".js-rq-title").html($('#quoteSubmitted').val());
		$(".js-rq-title").html($('#quoteSubmitted').val());
		}
	$("#js-quote-submited-message" ).css({"display": "block"});
	
	setQuoteItemsOnlyView();
}

function setQuoteItemsOnlyView(){
	$(".js-quoteItem").each(function () {

		let row = $(this);
		let index =  row.data("index");
		let quantity = $("#quote-count-"+index);
		let productNumber = $("#quote-product-number-"+index);
		let isCustom = $("#quote-custom-"+index);
		let cutomDescription = $("#quote-custom-description-"+index);				
		let color = $("#quote-color-"+index);
		let size = $("#quote-size-"+index);
		let removeButton =$("#remove-quote-item-"+index);
		console.log(removeButton)
		quantity.prop( "disabled", true );
		quantity.css({"background-color":"white"});
		quantity.css({"cursor":"default"});
		quantity.addClass("border-0");
		quantity.css({"-webkit-box-shadow":"none"});
		quantity.css({"box-shadow":"none"});
		quantity.prevAll().remove();

		productNumber.prop( "disabled", true );
		productNumber.css({"background-color":"white"});
		productNumber.css({"cursor":"default"});
		productNumber.addClass("border-0");
		productNumber.css({"-webkit-box-shadow":"none"});
		productNumber.css({"box-shadow":"none"});

		isCustom.next().css({"display":"inline-block"});
		isCustom.next().css({"width":isCustom.next().width()});
		isCustom.parent().css({"cursor":"default"});
		if (!$("#quote-custom-"+index).prop("checked")){			
			isCustom.next().html("");
		}
		isCustom.remove();

		cutomDescription.prop( "disabled", true );
		cutomDescription.css({"background-color":"white"});
		cutomDescription.css({"cursor":"default"});
		cutomDescription.addClass("border-0");
		cutomDescription.css({"-webkit-box-shadow":"none"});
		cutomDescription.css({"box-shadow":"none"});

		color.prop( "disabled", true );
		color.css({"background-color":"white"});
		color.css({"cursor":"default"});
		color.addClass("border-0");
		color.css({"-webkit-box-shadow":"none"});
		color.css({"box-shadow":"none"});

		size.prop( "disabled", true );
		size.css({"background-color":"white"});
		size.css({"cursor":"default"});
		size.addClass("border-0");
		size.css({"-webkit-box-shadow":"none"});
		size.css({"box-shadow":"none"});

		removeButton.remove();
	});
	$(".js-rq-additemtoquote-space").remove();
}
	
$(document).ready(function(){

	$(document).click(function(e){
			let productNumber = $("#quote-product-number").val();
			let cutomDescription = $("#quote-custom-description").val();
			if((e.target.id != 'quote-product-number')&& (productNumber !="") && (cutomDescription =="")){
			$("#quote-custom-description").focus();
			}
	})
	
	$("#quote-product-number").change(function(){
	$("#quote-custom-description").val("");
	})
	
	$("#quote-product-number").blur(function(){
		let productNumber = $("#quote-product-number").val();
		let cutomDescription = $("#quote-custom-description").val();
			let endpoint = ACC.config.encodedContextPath + "/p/product/" + productNumber;
			$.ajax({
				type:"GET",
				url: endpoint,
				success:function(data) {
					var name = data.name;
					var updateName = name.substring(0,29);
					$("#quote-custom-description").val(updateName);
					$("#quote-product-number").css({"border":"1px solid #cccccc"});
					document.getElementById('add-request-quote-error').innerHTML='';
				},
				error: function(e) {
					$("#quote-product-number").css({"border":"1px solid #d00000"});
				
					let errorMsg = productNumberErrorMsg;
					let $existingError = $("#quote-product-number")
						.siblings(".add-request-quote-error")
						.filter(function() {
							return $(this).text().trim() === errorMsg;
						});
				
					if ($existingError.length === 0) {
						$("#quote-product-number").after(
							`<div class="add-request-quote-error" data-type="quote-validation">${errorMsg}</div>`
						);
					}
				}				
			});
	});
	
	$("#quote-custom-description").focus(function(){
		let productNumber = $("#quote-product-number").val();
		let cutomDescription = $("#quote-custom-description").val();
			let endpoint = ACC.config.encodedContextPath + "/p/product/" + productNumber;
				$.ajax({
					type:"GET",
					url: endpoint,
					success:function(data) 
						{
							var name = data.name;
							var updateName = name.substring(0,29);
							$("#quote-custom-description").val(updateName);
							$("#quote-product-number").css({"border":"1px solid #cccccc"});
							document.getElementById('add-request-quote-error').innerHTML='';
						},
					error:function(e) {
							$("#quote-product-number").css({"border":"1px solid #d00000"});
							document.getElementById('add-request-quote-error').innerHTML=productNumberErrorMsg;
					}
					});
		
	})
	
	$("#js-additem-toquote").click(function(){	
		removeQuoteItemError();
		var quoteCount = $("#quote-count").val();
		var quoteProductNumber = $("#quote-product-number").val();
		var quoteCustom = $("#quote-custom").prop("checked");

		//console.log(quoteCount + " " + quoteProductNumber + " " + quoteCustom + " " + quoteCustomDescription + " " + quoteColor + " " + quoteSize);

		if (quoteCount > 0 && quoteCount!='' && quoteProductNumber !=''){
			// Below settimeout is required to get and fill the description of the prod on adding
			setTimeout(() => {
				var quoteCustomDescription = $("#quote-custom-description").val();
				var quoteColor = $("#quote-color").val();
				var quoteSize = $("#quote-size").val();
				
				$("#quote-count").css({"border":"1px solid #5a5a5a"});
				$("#quote-product-number").css({"border":"1px solid #5a5a5a"});
	
				var quoteId = $("#quote-id").attr("counter-id");
				quoteId =  parseInt(quoteId) + 1 

				const rowTemplate = `<tr id="quoteItem${quoteId}" class="js-quoteItem" data-index="${quoteId}">`+
						`<td class='quantity-cell'><div class='number'><span class='plus quotePlus' style='cursor:pointer'>+</span><span class='minus quoteMinus' style='cursor:pointer'>-</span><input type='text' class='form-control' id='quote-count-${quoteId}' value='${quoteCount}'/></div></td>`+
						`<td class='product-number-cell'><input type='text' class='form-control' id='quote-product-number-${quoteId}' value='${quoteProductNumber}'><div id="add-request-quote-error-${quoteId}" class="add-request-quote-error"></div></td>`+
						`<td class='custom-description-cell'><input type='text' class='form-control' id='quote-custom-description-${quoteId}' value='${quoteCustomDescription}' disabled="disabled"></td>`+
						`<td class='color-cell'><input type='text' class='form-control' id='quote-color-${quoteId}' value='${quoteColor}' disabled="disabled"></td>`+
						`<td class='size-cell'><input type='text' class='form-control' id='quote-size-${quoteId}' value='${quoteSize}' disabled="disabled"><p id='remove-quote-item-${quoteId}'  class='remove-quote-item' onclick="removeQuoteItem('quoteItem${quoteId}')">Remove</p></td>`+
						`</tr>`;
				if($(".current-quotes").hasClass('hidden')){
					$(".current-quotes").removeClass('hidden')
				}
				$(".current-quotes").append(rowTemplate);
	
				$("#quote-id").attr("counter-id",quoteId);
				$('#quote-product-number').val('');
				$("#quote-custom").prop('checked', false);
				$("#quote-custom-description").val('');
				$("#quote-color").val('');
				$("#quote-size").val('');
				$("#quote-count").val('1');
				// Below are the Plus Minus event assignments after adding an item as new html is getting 
				$('.quoteMinus').each(function () {
					var quoteMinusButton = $(this);
					quoteMinusButton.unbind("click");		// this line is to avoid duplicate event assignments when > 1 line items
					quoteMinusButton.bind('click', (event) => {
						var $input = $(this).parent().find('input');
						var count = parseInt($input.val()) - 1;
						count = count < 1 ? 1 : count;
						$input.val(count);
						$input.change();
						return false;
					});
				});
				$('.quotePlus').each(function () {
					var quotePlusButton = $(this);
					quotePlusButton.unbind("click");		// this line is to avoid duplicate event assignments when > 1 line items
					quotePlusButton.bind('click', (event) => {
						var $input = $(this).parent().find('input');
						$input.val(parseInt($input.val()) + 1);
						$input.change();
						return false;
					});
				});
			},2000);
			removeQuoteItemError();
		}else{
			if (quoteCount==''){$("#quote-count").css({"border":"1px solid #d00000"});}
			if (quoteProductNumber == '') {
				$("#quote-product-number").css({"border":"2px solid #d00000"});
				ACC.CRLMyAccountDashboard.hideCrlPageLoader();
			
				let errorMsg = productNumberErrorMsg ;
			
				let $existingError = $("#quote-product-number")
					.siblings(".add-request-quote-error")
					.filter(function () {
						return $(this).text().trim() === errorMsg;
					});
			
				if ($existingError.length === 0) {
					let errorDiv = document.createElement("div");
					errorDiv.className = "add-request-quote-error";
					errorDiv.setAttribute("data-type", "quote-validation");
					errorDiv.textContent = errorMsg;
					$("#quote-product-number").after(errorDiv);
				}
			}
			
			
		}
		document.getElementById('add-request-quote-error').innerHTML='';
	});
	
});



$(document).ready(function() {
	$('.minus').click(function () {
		var $input = $(this).parent().find('input');
		var count = parseInt($input.val()) - 1;
		count = count < 1 ? 1 : count;
		$input.val(count);
		$input.change();
		return false;
	});
	$('.plus').click(function () {
		var $input = $(this).parent().find('input');
		$input.val(parseInt($input.val()) + 1);
		$input.change();
		return false;
	});

	function onSelectStateEvents() {
		const specStates = document.getElementsByClassName("spec-states");
		const specCountrydd = document.getElementById("address.region");
		if(specStates) {
			for(let i=0; i < specStates.length; i++) { 
				specStates[i].addEventListener('click',(event)=> {
					const element = event.target;
					if(element.tagName === "LI") {
						setSelectedOption(element.children[0].dataset.value,specCountrydd);
					} else if(element.tagName === 'DIV') {
						setSelectedOption(element.dataset.value,specCountrydd);
					}
				});
			}
		}
	};

	function setSelectedOption(value,dropdown) {
		dropdown.value = value;
	}

	function fillOutProductInfo(){
		$('#quote-product-number').val(localStorage.getItem('_productCode_'));
		if(localStorage.getItem('_productQuantity_') !== 'null' && localStorage.getItem('_productQuantity_') != undefined && localStorage.getItem('_productQuantity_') !=''){
			$('#quote-count').val(localStorage.getItem('_productQuantity_'));
		}
		localStorage.removeItem('_productCode_');
		localStorage.removeItem('_productQuantity_');
	}

	function bindSubmitQuote(){
		$(".js-submitquote").on("click", function (e) {
			$("#js-rq-submitQuote").val("submit");
			if (validateInputs().length == 0 && $(".js-quoteItem").length >0){
				//console.log('inputs are ok and there are Items');
				ACC.CRLMyAccountDashboard.displayCrlPageLoader();	
				checkIfProductsAreValidated();		
			}
		});
		
		$('#crl-dropdown--input__crl-quote-states').bind('click', function(){
			$("#crl-dropdown--input__crl-quote-states").css("border-color","#4a4a4a");			
		});
	}	
	function bindSaveQuote(){
		$(".js-savequote").on("click", function (e) {
			$("#js-rq-submitQuote").val("save");
			if (validateInputs().length == 0 && $(".js-quoteItem").length >0){
				//console.log('inputs are ok and there are Items');
				ACC.CRLMyAccountDashboard.displayCrlPageLoader();	
				checkIfProductsAreValidated();		
			}
		});
		
		$('#crl-dropdown--input__crl-quote-states').bind('click', function(){
			$("#crl-dropdown--input__crl-quote-states").css("border-color","#4a4a4a");			
		});
	}	

	function checkIfProductsAreValidated(){
		let invalidProducts= 0;
		let counter = 0;

		$(".js-quoteItem").each(function () {

			let row = $(this);
			let index =  row.data("index");
			let productNumber = $("#quote-product-number-"+index).val();
			let endPointValidateProduct = ACC.config.encodedContextPath + `/accountdashboard/my-account/my-quotes/validateitem/`;
			//console.log('trying to hit: ' + endPointValidateProduct+productNumber);

			$.ajax({
				type:"GET",
				url: endPointValidateProduct+productNumber,
				success:function(data) {
					counter++;
					//console.log('product ' + productNumber + ' is OK ? : ' + data);
					$("#quote-product-number-"+index).css({"border":"1px solid #5a5a5a"});
					if (!data){
						$("#quote-product-number-"+index).css({"border":"2px solid #d00000"});
						ACC.CRLMyAccountDashboard.hideCrlPageLoader();
						var id ='add-request-quote-error-'+index;
						document.getElementById(id).innerHTML=productNumberErrorMsg;
						invalidProducts++; 
					}
					//console.log('comparing ' + counter + ' con ' + $(".js-quoteItem").length);
					if (counter == $(".js-quoteItem").length && invalidProducts == 0){
						saveQuote();
						//console.log('starting to SAVE');
					}
				},
				error:function(e) {
					console.log('error: ',e);
					ACC.CRLMyAccountDashboard.hideCrlPageLoader();
				}
			});
		});
	}

	function saveQuote() {
		//console.log('starting save Quote');
		var companyName = $("#js-rq-companyName").val();
		var contactName = $("#js-rq-contactName").val();
		var poNumber = $("#js-rq-poNumber").val().length > 0 ? $("#js-rq-poNumber").val():'EMPTY';
		var phoneNumber = $("#js-rq-phoneNumber").val().length > 0 ? $("#js-rq-phoneNumber").val():'EMPTY';
		var addressLine1 = $("#js-rq-addressLine1").val();
		var addressLine2 = $("#js-rq-addressLine2").val();
		
		const country = document.getElementById("js-rq-country").value;
		const state = document.getElementById("js-rq-state").value;
		
		var zipCode = $("#js-rq-zipCode").val();
		var city = $("#js-rq-city").val();		
		var jobName = $("#js-rq-jobName").val();
		var datepickerFrom = $("#datepickerFrom" ).val();
		var datepickerTo = $("#datepickerTo" ).val();
		var notes1 = $("#js-rq-notes").val().length > 0 ?  $("#js-rq-notes").val() :'EMPTY';
		var datepickerFrom1=datepickerFrom.replaceAll("/", "-");
		var datepickerTo1=datepickerTo.replaceAll("/", "-");
		var notes=notes1 +"~"+datepickerFrom1+"~"+datepickerTo1;
		var quoteCode = $("#js-rq-quoteNumber").val();
		var ifSiteCrlCanada = document.body.classList.contains("site-crlcanada");
		var ifSiteCrl = document.body.classList.contains("site-crlaurence");
		if(ifSiteCrlCanada || ifSiteCrl){
			var projectJobName = $("#js-rq-proj-jobName").val();
		}
		let quoteHeaderId;
		//TODO VALIDATE THE COUNTRY AND STATE VALUE

		
		//console.log('companyName: ' + companyName + ' address: ' + address + ' city: ' + city + ' state: ' + state + ' zipCode: ' + zipCode + ' phoneNumber: ' + phoneNumber);
		let quoteHeaderObject = null;
		if(ifSiteCrlCanada || ifSiteCrl){
			if(quoteCode){
				quoteHeaderObject = `${companyName}~${poNumber}~${phoneNumber}~${country}~${state}~${zipCode}~${city}~${jobName}~${notes}~${addressLine2}~${addressLine1}~${contactName}~${projectJobName}~${quoteCode}`;
			} else {
				quoteHeaderObject = `${companyName}~${poNumber}~${phoneNumber}~${country}~${state}~${zipCode}~${city}~${jobName}~${notes}~${addressLine2}~${addressLine1}~${contactName}~${projectJobName}`;
			}
		} else {
			quoteHeaderObject = `${companyName}~${poNumber}~${phoneNumber}~${country}~${state}~${zipCode}~${city}~${jobName}~${notes}~${addressLine2}~${addressLine1}~${contactName}`;
		}
		
		let encodedQuoteHeaderObject=`${encodeURIComponent(quoteHeaderObject)}`;
		let endPoint =ACC.config.encodedContextPath + `/accountdashboard/my-account/my-quotes/addquoteheader/${encodedQuoteHeaderObject}`;							
		//console.log('trying to save the quote object: ',quoteHeaderObject);
		$.ajax({
			type:"GET",
			url: endPoint,
			success:function(data) {
				//console.log('BO Generated Quote Id: ',data);
				quoteHeaderId = data;
				var quoteRequest = $("#js-rq-submitQuote").val();
				var isSubmitQuote = true;
				if(quoteRequest == 'save'){
					isSubmitQuote = false;
				}
				console.log('Submit type: '+ isSubmitQuote);
				let endPointAddQuoteItem = ACC.config.encodedContextPath+`/accountdashboard/my-account/my-quotes/addquoteitemlist/`;
				const totalQuoteItems = $(".js-quoteItem").length;
				let countQuoteItems = 0;
				let quoteItemObject = [];
				let quoteItemData = [];
				$(".js-quoteItem").each(function () { // ------------- Saving Each Quote Item ----------------

					let row = $(this);
					let index = row.data("index");

					quoteItemData.push({
						"quoteHeaderId": quoteHeaderId,
						"quantity": $("#quote-count-" + index).val(),
						"productNumber": $("#quote-product-number-" + index).val(),
						"isCustom": $("#quote-custom-" + index).prop("checked"),
						"cutomDescription": $("#quote-custom-description-" + index).val() ? $("#quote-custom-description-" + index).val() : 'EMPTY',
						"color": $("#quote-color-" + index).val() ? $("#quote-color-" + index).val() : '',
						"size": $("#quote-size-" + index).val() ? $("#quote-size-" + index).val() : '',
						"totalQuoteItems": totalQuoteItems,
						"submitQuote":isSubmitQuote

					})
					  //quoteItemObject[index-1] =`${quoteHeaderId}~${quantity}~${productNumber}~${isCustom}~${cutomDescription}~${color}~${size}~${totalQuoteItems}`;
					//console.log('index: ' + index + ' quantity: ' + quantity + ' productNumber: ' + productNumber + ' isCustom: ' + isCustom +  ' cutomDescription: ' + cutomDescription + ' color: ' + color  + ' size: ' + size );
				});
				quoteItemObject = {
					"quoteItemData" : quoteItemData
				}
						$.ajax({
						type: "POST",
						url: endPointAddQuoteItem,
						data: JSON.stringify(quoteItemObject),
						contentType: "application/json; charset=utf-8",
						dataType: "json",
						
						success:function(result) {
							//console.log('created item response', result);
							if(ifSiteCrlCanada || ifSiteCrl){
								$(".js-savequote").hide();
							}
							if (true)countQuoteItems++;
							if (result.isCompleted){
								//console.log('the generated Quote Id is : ',(result.code != null && result.code!="") ? result.code : quoteHeaderId);
								displaySavedQuoteUI((result.code != null && result.code!="") ? result.code : quoteHeaderId);
							}
							ACC.CRLMyAccountDashboard.hideCrlPageLoader();
							
						},
						error:function(e) {
							console.log('error: ',e);
							ACC.CRLMyAccountDashboard.hideCrlPageLoader();
						}
					});
			},
			error:function(e) {
				console.log('error: ',e);
				ACC.CRLMyAccountDashboard.hideCrlPageLoader();
			}
		});
		ACC.DynamicYield.triggerQuoteSubmitEvent();
	}

	function validateInputs() {
		let inputs = [];
		let productInputs = [];
		let inputsInvalid = [];
		const jobNameRegex = /[\/\\~]/;
		let productNumber = $("#quote-product-number").val();
		console.log('productNumber', productNumber);

		const errorMessages = {
			en: {
				'js-rq-companyName': 'Please enter your company name',
				'js-rq-contactName': 'Please enter your name',
				'js-rq-addressLine1': 'Please enter a valid address',
				'js-rq-country': 'Please select your country',
				'js-rq-state': 'Please select your state',
				'js-rq-zipCode': 'Please enter a valid zip code',
				'js-rq-city': 'Please enter your city',
				'js-rq-jobName': 'Please enter a project name',
				'js-rq-proj-jobName': 'Please enter a job name',
				'quote-product-number': 'Please enter a valid item number',
			},
			fr: {
				'js-rq-companyName': 'Veuillez saisir le nom de votre entreprise',
				'js-rq-contactName': 'Veuillez saisir votre nom',
				'js-rq-addressLine1': 'Veuillez saisir une adresse valide',
				'js-rq-country': 'Veuillez sélectionner votre pays',
				'js-rq-state': 'Veuillez sélectionner votre province',
				'js-rq-zipCode': 'Veuillez saisir un code postal valide',
				'js-rq-city': 'Veuillez saisir votre ville',
				'js-rq-jobName': 'Veuillez saisir un nom de projet',
				'js-rq-proj-jobName': 'Veuillez saisir un nom de travail',
				'quote-product-number': 'Veuillez saisir un numéro d’article valide',
				'js-rq-itemNotAdded': 'Veuillez ajouter un article afin de soumettre votre demande de devis.'
			}
		};
	
		function getErrorMessage(fieldId) {
			let lang = getCurrentLang();
			return errorMessages[lang][fieldId] || '';
		}
	
		const projectName = $("#js-rq-jobName");
		const jobName = $("#js-rq-proj-jobName");
		const cmpName = $("#js-rq-companyName");
		const notes = $("#js-rq-notes");
		const contactName = $("#js-rq-contactName");
	
		const ifSiteIsUSH = document.body.classList.contains("site-ush");
		const ifSiteCrl = document.body.classList.contains("site-crlaurence");
		const ifSiteCrlCanada = document.body.classList.contains("site-crlcanada");
	
		inputs.push('js-rq-companyName', 'js-rq-contactName', 'js-rq-addressLine1', 'js-rq-country', 'js-rq-state', 'js-rq-city', 'js-rq-zipCode');
	
		if (ifSiteCrlCanada || ifSiteCrl) {
			inputs.push('js-rq-proj-jobName');
		}
	
		if (ifSiteCrl || ifSiteCrlCanada) {
			inputs.push('js-rq-jobName');
			const specialCharactersValidityCheck = [projectName, jobName, cmpName, notes, contactName];
			const fieldNames = ["Project Name", "Job Name", "Company Name", "Notes", "Contact Name"];
	
			specialCharactersValidityCheck.forEach((input, index) => {
				if (jobNameRegex.test(input.val())) {
					if (input.nextAll(".quote-error-message").length === 0) {
						$('<label class="error-message error-message--visible-form-block-mobile" style="color: rgb(208, 0, 0); font-weight:bold;">' +
							'Special Characters (&#47; &#92; &#126;) are not allowed in ' + fieldNames[index] + '</label>')
							.insertAfter(input.next(".form-control-placeholder"));
					}
					inputsInvalid.push(input);
				} else {
					input.nextAll(".quote-error-message").remove();
					inputsInvalid = inputsInvalid.filter(i => i[0].id !== input[0].id);
				}
			});
		}
	
		if (ifSiteIsUSH) {
			inputs.push('js-rq-jobName', 'datepickerFrom', 'datepickerTo');
		}
	
		inputs.forEach(function (input) {
			const inputObject = $("#" + input);
			inputObject.css({ "border": "1px solid #5a5a5a" });
			inputObject.nextAll(".quote-error-message").remove();
			inputObject.parent().find("label").filter(function () {
				return $(this).text().trim() === getErrorMessage(input);
			}).remove();
	
			if (input === "js-rq-contactName" && !ifSiteIsUSH) {
				const contactNameRegex = /^[a-zA-Z ]*$/;
				if (!contactNameRegex.test(inputObject.val())) {
					inputObject.css({ "border": "2px solid #d00000" });
					if (inputObject.nextAll(".quote-error-message").length === 0) {
						$('<label class="quote-error-message" style="color: rgb(208, 0, 0); font-weight:bold; text-transform:none;">' +
							getErrorMessage(input) + '</label>')
							.insertAfter(inputObject.next(".form-control-placeholder"));
					}
					inputsInvalid.push(inputObject);
				}
			}
	
			if (inputObject.val() === "" || inputObject.val() === undefined ||
				(inputObject.prop('selectedIndex') === 0 && (!ifSiteIsUSH && input !== "js-rq-country"))) {
				inputObject.css({ "border": "2px solid #d00000" });
	
				if (getErrorMessage(input)) {
					if (inputObject.is('select')) {
						if (inputObject.nextAll(".quote-error-message").length === 0) {
							$('<label class="quote-error-message" style="color: rgb(208, 0, 0); font-weight:bold; text-transform:none;">' +
								getErrorMessage(input) + '</label>')
								.insertAfter(inputObject);
						}
					} else if (inputObject.nextAll(".quote-error-message").length === 0) {
						$('<label class="quote-error-message" style="color: rgb(208, 0, 0); font-weight:bold; text-transform:none;">' +
							getErrorMessage(input) + '</label>')
							.insertAfter(inputObject.next(".form-control-placeholder"));
					}
				}
				inputsInvalid.push(inputObject);
			}
		});
	
		if (!$(".js-quoteItem").length) {
			productInputs.push('quote-count', 'quote-product-number');
			productInputs.forEach(function (input) {
				const inputObject = $("#" + input);
				inputObject.css({ "border": "1px solid #5a5a5a" });
				inputObject.nextAll(".quote-error-message").remove();
	
				if (inputObject.val() === "" || inputObject.val() === undefined) {
					inputObject.css({ "border": "2px solid #d00000" });
					if (getErrorMessage(input) && inputObject.nextAll(".quote-error-message").length === 0) {
						$('<label class="quote-error-message" style="color: rgb(208, 0, 0); font-weight:bold; text-transform:none;">' +
							getErrorMessage(input) + '</label>')
							.insertAfter(inputObject.next(".form-control-placeholder"));
					}
					inputsInvalid.push(inputObject);
				}
			});
		}
	
		validateQuoteItems();
		console.log(validateQuoteItems());
	
		return inputsInvalid;
	}
	

	function validateQuoteItems() {
		const quoteItems = document.querySelectorAll('.js-quoteItem');
		const productNumberCell = document.querySelector(".product-number-cell");
	
		if (!productNumberCell) {
			console.warn("Target parent element for error div not found.");
			return false;
		}
	
		const existingErrors = productNumberCell.querySelectorAll(".add-request-quote-error[data-type='quote-validation']");
		if (existingErrors.length > 1) {
			existingErrors.forEach((err, idx) => {
				if (idx > 0) err.remove();
			});
		}
	
		let errorDiv = productNumberCell.querySelector(".add-request-quote-error[data-type='quote-validation']");
		const errorMessage = submitError;
	
		if (quoteItems.length === 0) {
			if (!errorDiv) {
				errorDiv = document.createElement("div");
				errorDiv.className = "add-request-quote-error";
				errorDiv.setAttribute("data-type", "quote-validation");
				productNumberCell.appendChild(errorDiv);
			}
			errorDiv.textContent = errorMessage;
			return false;
		} else {
			if (errorDiv) errorDiv.remove();
			return true;
		}
	}
	


	fillOutProductInfo();
	bindSubmitQuote();
	bindSaveQuote();
});

	function removeQuoteItemError() {
		const productNumberCell = document.querySelector(".product-number-cell");
		if (!productNumberCell) return;

		const existingError = productNumberCell.querySelector(".add-request-quote-error[data-type='quote-validation']");
		if (existingError) {
			existingError.remove();
		}
	}

$(document).ready(function() {
	populateAccountDetails();
	$( "#datepickerFrom" ).datepicker({ minDate: 0 });
	$( "#datepickerTo" ).datepicker({ minDate: 0 });
	$( "#quoteEntensionDatePicker" ).bind('click', (event) => {
		event.stopImmediatePropagation();
		if (event.detail === 1) {
			quoteExtDatePicker();
		}
	});	
	
	getQuoteRequestPageWithQuoteDetails();	
	backToSiteHome();
	
});

/*quotedetails page quote extension functionality related code starts*/

	function quoteExtDatePicker(){

		const quoteData = $("#quoteExtensionData");
		let currentQuoteExpirationYear = parseInt(quoteData.data('quote-year'));
		let currentQuoteExpirationMonth = parseInt(quoteData.data('quote-month'));
		let currentQuoteExpirationDay = parseInt(quoteData.data('quote-day'));
		let quoteNumber = quoteData.data('quote-number');
		let quoteGroupFlag = quoteData.data('quote-flag');
		var submitButton=$('#quoteSubmit-buttonmsg').val();
		var cancelButton=$('#quoteCancel-buttonmsg').val();
				
		$( "#quoteEntensionDatePicker" ).datepicker({ 
		 minDate: new Date(currentQuoteExpirationYear,currentQuoteExpirationMonth-1,currentQuoteExpirationDay+1)
		 
		});
		
		if ($('#quoteEntensionDatePicker').children('#datePickerQuoteAction').length == 0) {

			const rowTemplate = `<div id="datePickerQuoteAction">`+
			`<span><button  class="btn btn-secondary  w-100 w-sm-auto" id="quoteExtensionRequestCancel">${cancelButton}</button></span>`+
			`<span><button class="btn btn-secondary w-100 w-sm-auto" id="quoteExtensionRequestSubmit">${submitButton}</button></span>`+
			`</div>`;
	
			$(".quoteEntensionDatePicker").append(rowTemplate);
		}
		
		$( "#quoteExtensionRequestCancel" ).bind('click', (event) => {
			event.stopImmediatePropagation();
			if (event.detail === 1) {
				quoteExtensionReset();
			}
		});	
		
		$( "#quoteExtensionRequestSubmit" ).bind('click', (event) => {
			event.stopImmediatePropagation();
			if (event.detail === 1) {
				quoteExtensionRequestSubmit(quoteNumber,quoteGroupFlag);
			}
		});
	}
	
	function quoteExtensionReset(){
         $("#quoteEntensionDatePicker").datepicker("destroy");
         const rowTemplate = `<a id="datePickerSelected" class="btn btn-secondary" href="#">Request Quote Extension</a>`
         $(".quoteEntensionDatePicker").append(rowTemplate);
	}
	
	function quoteExtensionRequestSubmit(quoteNumber,quoteGroupFlag){
			var quoteExtendedDate = $("#quoteEntensionDatePicker" ).val();
			var orgQuoteDate = $("#originalQuoteDate" ).val();
			var ouoteContactName = $("#ouoteContactName" ).val();
			var quotePhone = $("#quotePhone" ).val();
			var quoteEmail = $("#quoteEmail" ).val();
			var quoteCompanyName = $("#quoteCompanyName" ).val();
			
			var quoteExtendedData = {
					      "quoteExtendedDate" : quoteExtendedDate,
					      "quoteNumber" : quoteNumber,
					      "quoteGroupFlag" : quoteGroupFlag,
					      "orgQuoteDate" : orgQuoteDate,
					      "ouoteContactName" : ouoteContactName,
					      "quotePhone": quotePhone,
					      "quoteEmail": quoteEmail,
					      "quoteCompanyName": quoteCompanyName
				   		}
				   		const commonMethods = new ACC.CRLCommon.GetMethods();
						const quoteExtensionUrl = commonMethods.SetLocalUrl(`accountdashboard/my-account/my-quotes/sendQuoteExtensionEmail`);
			$.ajax({
		       type: "POST",
		       contentType : 'application/json; charset=utf-8',
		       dataType : 'json',
		       url: quoteExtensionUrl,
		       data: JSON.stringify(quoteExtendedData), 
		       success : function(response) {
					if(response ==="OK"){
					    quoteExtensionPopUp("success");
					}else{
					    quoteExtensionPopUp("fail");
					}
						
			},
			error:function(e) {
				quoteExtensionPopUp("fail");
				console.log('error while sending email: ',e);
			}
		   });
			
	}
	
	function quoteExtensionPopUp(action){
	     	quoteExtensionReset(); 
	     	var popupTitle=$('#quoteExtSuccMsg').val();
	     	var className = "quote_extension_success-modal"
	     	var href = "#quote_extension_success";
	     	if(action === "fail"){
	     		popupTitle=$('#quoteExtFailMsg').val();
	     		className="quote_extension_failed-modal";
	     		href="#quote_extension_failed";
	     	}
					var popupTitle=popupTitle;
					ACC.colorbox.open(popupTitle, {
						inline: true,
						className: className,
						href: href,
						width: '435px',

						onComplete: function() {
							$(this).colorbox.resize();
						}
				}); 
	}

/*quotedetails page quote extension functionality related code ends*/

/*quotedetails page requote functionality related code starts*/
function getQuoteRequestPageWithQuoteDetails(){
	if(window.location.href.indexOf('quote-requests?quoteCode') > -1){
			var ifSiteCrlCanada = document.body.classList.contains("site-crlcanada");
			var ifSiteCrl = document.body.classList.contains("site-crlaurence");
			var storeId = $("#storeId").val();
			$("#js-rq-phoneNumber").val(reQuoteCustomerInfo.phone);
			if(reQuoteCustomerInfo.contact != null){
				if(reQuoteCustomerInfo.contact.length <= 20){
					$("#js-rq-contactName").val(reQuoteCustomerInfo.contact);
				}else{
					$("#js-rq-contactName").val(reQuoteCustomerInfo.contact.substr(0, 20));
				}
			}
			if(reQuoteShippingInfo.company.length <= 30){
				$("#js-rq-companyName").val(reQuoteShippingInfo.company);
			}else{
				$("#js-rq-companyName").val(reQuoteShippingInfo.company.substr(0, 30));
			}
					
			$("#js-rq-addressLine1").val(reQuoteShippingInfo.address1);
			$("#js-rq-addressLine2").val(reQuoteShippingInfo.address2);
			$("#js-rq-zipCode").val(reQuoteShippingInfo.zip);
			$("#js-rq-city").val(reQuoteShippingInfo.city);
			$("#js-rq-quoteNumber").val(reQuoteInfo.number);
			if(storeId == 'crlcanada' || storeId =='crlaurenceS4'){
				$("#js-rq-jobName").val(reQuoteInfo.projectName);
				$("#js-rq-proj-jobName").val(reQuoteInfo.jobName);
			} else {
				$("#js-rq-jobName").val(reQuoteInfo.jobName);
			}
			document.getElementById("js-rq-poNumber").value = reQuoteInfo.po;
			fromDate = new Date(reQuoteInfo.date);
			$("#datepickerFrom").datepicker("setDate", new Date(fromDate.getFullYear(),fromDate.getMonth(),fromDate.getDate()));
			toDate = new Date(reQuoteInfo.expiration);
			$("#datepickerTo").datepicker("setDate", new Date(toDate.getFullYear(),toDate.getMonth(),toDate.getDate()));
			$("#js-rq-country").val(reQuoteShippingInfo.country);
			const stateIso= reQuoteShippingInfo.state;
			if(undefined != stateIso){
				ACC.PurchaserRegisterPage.lodadPurchaserRegions("#js-rq-country","#js-rq-state",stateIso);
			}else{
				ACC.PurchaserRegisterPage.lodadPurchaserRegions("#js-rq-country","#js-rq-state","");
			}
			
			reQuoteItems();
		}	
}

function reQuoteItems(){
	reQuoteItemsInfo.forEach(function(value,index){
		var itemNumber = value.number;
		if(itemNumber != undefined && !(itemNumber ==="") && !(itemNumber.startsWith("NOTE") || itemNumber.startsWith("N0TE"))){
			checkIfReQuoteProductIsValid(value);
		}
	});
}

function checkIfReQuoteProductIsValid(product){
		
			let productNumber = product.number;
			let endPointValidateProduct = ACC.config.encodedContextPath + `/accountdashboard/my-account/my-quotes/validateitem/`;
			$.ajax({
				type:"GET",
				url: endPointValidateProduct+productNumber,
				success:function(data) {
					counter++;
					if (data){
						$("#quote-count").val(product.quantity);
						$("#quote-product-number").val(product.number);
						$("#quote-custom-description").val(product.description);
						$("#js-additem-toquote").click(); 
					}else{
						console.log('product ::product.number:: doesnot exists in system');	
					}
				},
				error:function(e) {
					console.log('error: ',e);
				}
			});
		
	}
	
     function backToSiteHome() {
        $(".backToSiteHome").on("click", function () {
            var sUrl = ACC.config.encodedContextPath;
            window.location = sUrl;
        });
    }
/*quotedetails page requote functionality related code ends*/

$(".js-email-quote-btn").on("click", function() {
	var quoteNumber = $(this).val();
	const emailQuoteUrl = `${ACC.config.encodedContextPath}/accountdashboard/my-account/my-quotes/quoteEmailToCustomer`;
	if (undefined != quoteNumber) {
		$.ajax({
			type: "GET",
			url: emailQuoteUrl,
			data: { "quoteNumber": quoteNumber },
			success: function(data) {
				if (data) {
					document.getElementById("emailQuoteConfModal").style.display = "block";
					$('#emailQuoteConfMsg').html($("#quoteEmailConfMsg").val());
				} else {
					document.getElementById("emailQuoteConfModal").style.display = "block";
					$('#emailQuoteConfMsg').html($("#quoteEmailfailConfMsg").val());
				}
			},
			error: function(e) {
				document.getElementById("emailQuoteConfModal").style.display = "block";
				$('#emailQuoteConfMsg').html($("#quoteEmailfailConfMsg").val());
			}
		});
	}
});


$(".emailQuoteConfModal__close").bind('click', (event) => {
	if ($("#emailQuoteConfModal").is(":visible") && !$(".pd__body").is(":visible")) {
		$(".pd__body").show();
		$(".ProductDrawer__Section").show();
		$(".pd__breadcrumb").show();
		$(".productDetailsPageSectionUpSelling").show();
		$(".productDetailsPageSectionCrossSelling").show();
		$(".page-footer").show();
		$(".getAccAlert").show();
		$(".page-footer__title").show();
		$(".page-footer__subtitle").show();
		$(".back-btn-detialspage").show();
	}
	document.getElementById("emailQuoteConfModal").style.display = "none";
});

function getCurrentLang() {
	let langText = document.querySelector(".lang-cname")?.textContent.trim();
	return langText && langText.includes("Français") ? "fr" : "en";
}