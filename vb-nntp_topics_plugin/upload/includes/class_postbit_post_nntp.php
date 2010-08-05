<?php

class vB_Postbit_Post_Nntp extends vB_Postbit_Post
{
    /**
	* The name of the template that will be used to display this post.
	*
	* @var	string
	*/
	var $templatename = 'postbit_nntp';

    /**
	* Template method. Calls all the appropriate methods to build a post and then evaluates the template.
	*
	* @param	array	Post information
	*
	* @return	string	HTML for the post
	*/
	function construct_postbit(&$post)
	{
        $this->post = &$post;
        global $show, $vbphrase, $stylevar;
        $tmp_show = $show;
        $tmp_stylevar = $stylevar;
        $tmp_vbcms = $this->registry->products['vbcms'];
        $this->registry->products['vbcms'] = false;

        $session_url = $vbulletin->session->vars['sessionurl'];
        $vbulletin->session->vars['sessionurl'] = '';

        $this->parse_bbcode();
        $this->process_attachments();

        $templater = vB_Template::create($this->template_prefix . $this->templatename);

        $templater->register('template_hook', $template_hook);
        $templater->register('post', $post);
        $result = $templater->render();

        $this->registry->products['vbcms'] = $tmp_vbcms;
        $show = $tmp_show;
        $stylevar = $tmp_stylevar;
        $vbulletin->session->vars['sessionurl'] = $session_url;
		return $result;
    }
}
?>
